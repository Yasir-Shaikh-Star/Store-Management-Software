/* storage.js
   Saving, loading and ALL balance calculations live here.
   Pages call these functions and never do their own money maths.

   Data layout (one JSON object saved under one LocalStorage key):
   {
     settings:     { shopName, ownerName, phone, address, currency, openingBalance, lastBackup },
     customers:    [ { id, name, phone, address, notes } ],
     suppliers:    [ { id, name, phone, address, notes } ],
     income:       [ { id, date, amount, paymentMethod: "cash"|"credit", customerId, description } ],
     expenses:     [ { id, date, category, amount, description } ],
     loans:        [ { id, person, type: "borrowed"|"given", amount, date, description,
                       payments: [ { id, date, amount, note } ] } ],
     users:        [ { id, name, username, role: "owner"|"staff", salt, hash } ]  (passwords are never stored, only a salted hash)
   transactions: [ { id, type, partyId, date, amount, description } ]
        type is one of: customer_payment, supplier_bill, supplier_payment
     products:     [ { id, name, unit, openingQty, minLevel (order when stock falls to this), orderQty (usual quantity to order), notes } ]
     stockMoves:   [ { id, productId, type: "in"|"out", date, qty, note } ]   (in = stock added, out = sold)
     Stock is separate from the cash book: remaining = openingQty + all "in" - all "out".
   }
   A credit sale is an income record with paymentMethod "credit" and a customerId.
*/

const STORAGE_KEY = "hardwareStoreData";
const DATA_COLLECTIONS = ["customers", "suppliers", "income", "expenses", "loans", "transactions", "products", "stockMoves"];
const COLLECTIONS = DATA_COLLECTIONS.concat(["users"]);
const ID_PREFIX = { customers: "cus", suppliers: "sup", income: "inc", expenses: "exp", loans: "loan", transactions: "txn", users: "usr", products: "prd", stockMoves: "stk" };

function round2(n) {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}

/* ---------- Saving and loading ---------- */

const Store = {
  data: null,
  storageWorks: true,

  defaults() {
    return {
      settings: {
        shopName: "Hardware Store",
        ownerName: "",
        phone: "",
        address: "",
        currency: "Rs.",
        openingBalance: 0,
        lastBackup: ""
      },
      customers: [],
      suppliers: [],
      income: [],
      expenses: [],
      loans: [],
      transactions: [],
      products: [],
      stockMoves: [],
      users: []
    };
  },

  /* Turns an object into a complete, safe data object.
     Returns null when the object does not look like our data at all. */
  normalize(obj) {
    if (!obj || typeof obj !== "object" || Array.isArray(obj)) return null;
    if (!obj.settings && !COLLECTIONS.some(c => Array.isArray(obj[c]))) return null;

    const out = this.defaults();
    out.settings = Object.assign(out.settings, obj.settings || {});
    out.settings.openingBalance = Number(out.settings.openingBalance) || 0;
    if (!out.settings.currency) out.settings.currency = "Rs.";

    COLLECTIONS.forEach(c => {
      const list = Array.isArray(obj[c]) ? obj[c] : [];
      out[c] = list.filter(r => r && typeof r === "object" && r.id);
    });
    out.users = out.users.filter(u => u.username && u.hash && u.salt);
    ["income", "expenses", "transactions"].forEach(c => {
      out[c].forEach(r => { r.amount = Number(r.amount) || 0; });
    });
    out.products.forEach(p => {
      p.openingQty = Number(p.openingQty) || 0;
      p.minLevel = Number(p.minLevel) || 0;
      p.orderQty = Number(p.orderQty) || 0;
    });
    out.stockMoves.forEach(m => { m.qty = Number(m.qty) || 0; });
    out.loans.forEach(loan => {
      loan.amount = Number(loan.amount) || 0;
      loan.payments = (Array.isArray(loan.payments) ? loan.payments : []).filter(p => p && p.id);
      loan.payments.forEach(p => { p.amount = Number(p.amount) || 0; });
    });
    return out;
  },

  load() {
    let raw = null;
    try {
      raw = localStorage.getItem(STORAGE_KEY);
    } catch (e) {
      this.storageWorks = false;
    }

    this.hadSavedData = !!raw;
    let parsed = null;
    if (raw) {
      try {
        parsed = JSON.parse(raw);
      } catch (e) {
        // Damaged data: keep a copy so nothing is lost, then start fresh.
        try { localStorage.setItem(STORAGE_KEY + "_damaged_" + Date.now(), raw); } catch (e2) { /* ignore */ }
      }
    }
    this.data = this.normalize(parsed) || this.defaults();
  },

  save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.data));
      if (typeof AutoBackup !== "undefined") AutoBackup.schedule(); // copies to the mirror and the backup folder
      return true;
    } catch (e) {
      this.storageWorks = false;
      if (typeof UI !== "undefined") {
        UI.toast("Could not save! Please download a backup now.", "error");
      }
      return false;
    }
  },

  /* Replace everything (used by Restore Backup). Returns false if the data is not valid. */
  replaceAll(obj) {
    const clean = this.normalize(obj);
    if (!clean) return false;
    // An old backup without logins must not lock the owner out: keep the current users.
    if (!clean.users.length) clean.users = this.data.users;
    this.data = clean;
    this.save();
    return true;
  },

  newId(collection) {
    return ID_PREFIX[collection] + "_" + Date.now() + "_" + Math.random().toString(36).slice(2, 6);
  },

  list(collection) {
    return this.data[collection];
  },

  find(collection, id) {
    return this.data[collection].find(r => r.id === id);
  },

  add(collection, record) {
    record.id = this.newId(collection);
    // always increasing, so entries made in the same moment keep their order
    this.lastCreated = Math.max(Date.now(), (this.lastCreated || 0) + 1);
    record.created = this.lastCreated;
    this.data[collection].push(record);
    this.save();
    return record;
  },

  update(collection, id, changes) {
    const record = this.find(collection, id);
    if (!record) return null;
    Object.assign(record, changes);
    this.save();
    return record;
  },

  remove(collection, id) {
    const list = this.data[collection];
    const index = list.findIndex(r => r.id === id);
    if (index === -1) return false;
    list.splice(index, 1);
    this.save();
    return true;
  }
};

/* ---------- Calculations ---------- */

/* Every kind of money entry. "cash" says how it changes cash in hand:
   1 = cash comes in, -1 = cash goes out, 0 = no cash moves (credit/bill only). */
const KINDS = {
  income_cash:      { label: "Income",                 cash: 1 },
  income_credit:    { label: "Credit Sale",            cash: 0 },
  expense:          { label: "Expense",                cash: -1 },
  customer_payment: { label: "Customer Payment",       cash: 1 },
  supplier_bill:    { label: "Supplier Bill",          cash: 0 },
  supplier_payment: { label: "Supplier Payment",       cash: -1 },
  loan_borrowed:    { label: "Money Borrowed",         cash: 1 },
  loan_given:       { label: "Money Given",            cash: -1 },
  loan_repaid:      { label: "Loan Repayment Paid",    cash: -1 },
  loan_received:    { label: "Loan Repayment Received", cash: 1 }
};

function inRange(date, from, to) {
  return (!from || date >= from) && (!to || date <= to);
}

const Calc = {
  /* One flat list of every entry, newest first. Used by dashboard, cash book and reports. */
  entries() {
    const d = Store.data;
    const out = [];
    const nameOf = (collection, id) => {
      const r = id ? Store.find(collection, id) : null;
      return r ? r.name : "";
    };
    const push = (id, collection, date, kind, desc, amount, party, created, extra) => {
      out.push(Object.assign({
        id, collection, date, kind, amount,
        desc: desc || "",
        party: party || "",
        created: created || 0,
        cash: KINDS[kind].cash * amount
      }, extra));
    };

    d.income.forEach(r => push(r.id, "income", r.date,
      r.paymentMethod === "credit" ? "income_credit" : "income_cash",
      r.description, r.amount, nameOf("customers", r.customerId), r.created));

    d.expenses.forEach(r => push(r.id, "expenses", r.date, "expense",
      [r.category, r.description].filter(Boolean).join(" - "), r.amount, "", r.created));

    d.transactions.forEach(r => {
      if (!KINDS[r.type]) return;
      const col = r.type === "customer_payment" ? "customers" : "suppliers";
      push(r.id, "transactions", r.date, r.type, r.description, r.amount, nameOf(col, r.partyId), r.created);
    });

    d.loans.forEach(loan => {
      const borrowed = loan.type === "borrowed";
      push(loan.id, "loans", loan.date, borrowed ? "loan_borrowed" : "loan_given",
        loan.description, loan.amount, loan.person, loan.created, { loanId: loan.id });
      loan.payments.forEach(p => push(p.id, "loans", p.date,
        borrowed ? "loan_repaid" : "loan_received",
        p.note, p.amount, loan.person, p.created || loan.created, { loanId: loan.id }));
    });

    out.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : b.created - a.created));
    return out;
  },

  /* "Ahmed - Hardware items" */
  describe(e) {
    return [e.party, e.desc].filter(Boolean).join(" - ");
  },

  /* Totals for a date range (from/to can be empty for "no limit"). */
  summary(from, to) {
    const s = {};
    Object.keys(KINDS).forEach(k => { s[k] = 0; });
    let cashIn = 0;
    let cashOut = 0;
    this.entries().forEach(e => {
      if (!inRange(e.date, from, to)) return;
      s[e.kind] += e.amount;
      if (e.cash > 0) cashIn += e.cash;
      if (e.cash < 0) cashOut -= e.cash;
    });
    Object.keys(s).forEach(k => { s[k] = round2(s[k]); });
    s.income = round2(s.income_cash + s.income_credit);
    s.expenses = s.expense;
    // Basic calculation only. Product purchase costs are not recorded, so this is NOT profit.
    s.netRecorded = round2(s.income - s.expenses);
    s.cashIn = round2(cashIn);
    s.cashOut = round2(cashOut);
    return s;
  },

  /* Cash in hand at the END of the given day. */
  cashBalanceOn(date) {
    let total = Store.data.settings.openingBalance;
    this.entries().forEach(e => { if (!date || e.date <= date) total += e.cash; });
    return round2(total);
  },

  /* Cash in hand at the START of the given day. */
  cashBalanceBefore(date) {
    let total = Store.data.settings.openingBalance;
    if (!date) return round2(total);
    this.entries().forEach(e => { if (e.date < date) total += e.cash; });
    return round2(total);
  },

  /* ----- customers and suppliers ("parties") ----- */

  PARTY: {
    customer: {
      collection: "customers",
      payType: "customer_payment",
      isCharge: (collection, r) => collection === "income" && r.paymentMethod === "credit" && r.customerId,
      partyOf: r => r.customerId
    },
    supplier: {
      collection: "suppliers",
      payType: "supplier_payment",
      isCharge: (collection, r) => collection === "transactions" && r.type === "supplier_bill",
      partyOf: r => r.partyId
    }
  },

  /* Credits/bills and payments of one customer or supplier, oldest first. */
  partyEntries(kind, id) {
    const cfg = this.PARTY[kind];
    const out = [];
    ["income", "transactions"].forEach(collection => {
      Store.list(collection).forEach(r => {
        let type = null;
        if (cfg.isCharge(collection, r) && cfg.partyOf(r) === id) type = "charge";
        else if (collection === "transactions" && r.type === cfg.payType && r.partyId === id) type = "payment";
        if (type) {
          out.push({ id: r.id, collection, type, date: r.date, amount: r.amount,
                     description: r.description || "", created: r.created || 0 });
        }
      });
    });
    out.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.created - b.created));
    return out;
  },

  partyTotals(kind, id) {
    let charged = 0;
    let paid = 0;
    this.partyEntries(kind, id).forEach(e => {
      if (e.type === "charge") charged += e.amount;
      else paid += e.amount;
    });
    return { charged: round2(charged), paid: round2(paid), remaining: round2(charged - paid) };
  },

  addPartyCharge(kind, id, v) {
    if (kind === "customer") {
      return Store.add("income", { date: v.date, amount: round2(v.amount), paymentMethod: "credit",
                                   customerId: id, description: v.description || "" });
    }
    return Store.add("transactions", { type: "supplier_bill", partyId: id, date: v.date,
                                       amount: round2(v.amount), description: v.description || "" });
  },

  addPartyPayment(kind, id, v) {
    return Store.add("transactions", { type: this.PARTY[kind].payType, partyId: id, date: v.date,
                                       amount: round2(v.amount), description: v.description || "" });
  },

  /* Total still owed by all customers / to all suppliers. */
  customerCredit() {
    return this.outstanding("customer");
  },

  supplierPayable() {
    return this.outstanding("supplier");
  },

  outstanding(kind) {
    const cfg = this.PARTY[kind];
    let total = 0;
    Store.list("income").forEach(r => { if (cfg.isCharge("income", r)) total += r.amount; });
    Store.list("transactions").forEach(r => {
      if (cfg.isCharge("transactions", r)) total += r.amount;
      if (r.type === cfg.payType) total -= r.amount;
    });
    return round2(total);
  },

  /* ----- loans ----- */

  loanPaid(loan) {
    return round2(loan.payments.reduce((sum, p) => sum + p.amount, 0));
  },

  loanRemaining(loan) {
    return round2(loan.amount - this.loanPaid(loan));
  },

  /* owe = what the shop still has to pay back, owed = what others still have to pay the shop */
  loanTotals() {
    let owe = 0;
    let owed = 0;
    Store.list("loans").forEach(l => {
      if (l.type === "borrowed") owe += this.loanRemaining(l);
      else owed += this.loanRemaining(l);
    });
    return { owe: round2(owe), owed: round2(owed) };
  },

  /* ----- stock (products, stock added, stock sold) ----- */

  stockOf(productId) {
    const p = Store.find("products", productId);
    let inQty = 0;
    let outQty = 0;
    Store.list("stockMoves").forEach(m => {
      if (m.productId !== productId) return;
      if (m.type === "in") inQty += m.qty;
      else outQty += m.qty;
    });
    const opening = p ? p.openingQty : 0;
    const remaining = round3(opening + inQty - outQty);
    const min = p ? p.minLevel : 0;
    const status = remaining <= 0 ? "out" : (min > 0 && remaining <= min ? "low" : "ok");
    return { opening, in: round3(inQty), out: round3(outQty), remaining, status };
  }
};

function round3(n) {
  return Math.round((Number(n) + Number.EPSILON) * 1000) / 1000;
}
