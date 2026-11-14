/* loans.js - money the shop borrowed from people, and money the shop gave to people */

App.pages.loans = {
  title: "Loans",

  render(el, id) {
    this.el = el;
    this.id = id && Store.find("loans", id) ? id : null;
    const action = App.takeAction("loans");
    if (this.id) this.renderDetail();
    else this.renderList(action);
  },

  refresh() {
    App.render(); // draws the page again on a fresh wrapper
  },

  typeText(loan) {
    return loan.type === "borrowed" ? "Borrowed from" : "Given to";
  },

  loanFields() {
    return [
      { name: "person", label: "Person name", required: true },
      { name: "type", label: "Type", type: "select", required: true,
        options: [["borrowed", "Borrowed - I took money from this person"], ["given", "Given - I gave money to this person"]] },
      { name: "amount", label: "Amount", type: "number", required: true },
      { name: "date", label: "Date", type: "date", required: true },
      { name: "description", label: "Description" }
    ];
  },

  /* ----- all loans ----- */

  renderList(action) {
    const el = this.el;
    const totals = Calc.loanTotals();
    el.innerHTML = `
      <div class="page-head"><h1>Loans</h1>
        <button class="btn btn-primary" data-act="add">+ Add Loan</button></div>
      <div class="cards cards-2">
        <div class="stat red"><div class="stat-label">You still have to pay back (Borrowed)</div><div class="stat-value">${money(totals.owe)}</div></div>
        <div class="stat green"><div class="stat-label">Others still have to pay you (Given)</div><div class="stat-value">${money(totals.owed)}</div></div>
      </div>
      <div class="card">
        <div class="filters">
          <label>Search<input type="search" data-search placeholder="Search by person or description"></label>
          <label>Type<select data-type><option value="">All</option><option value="borrowed">Borrowed</option><option value="given">Given</option></select></label>
        </div>
        <div data-list></div>
      </div>`;

    const draw = () => {
      const q = $("[data-search]", el).value;
      const type = $("[data-type]", el).value;
      const rows = Store.list("loans").filter(l =>
        (!type || l.type === type) &&
        matches(q, [l.person, l.description, l.amount, fmtDate(l.date), l.type])
      ).sort(byDateDesc);
      const list = $("[data-list]", el);
      if (!rows.length) {
        list.innerHTML = `<p class="empty">${Store.list("loans").length ? "No match found." : "No loans recorded yet."}</p>`;
        return;
      }
      list.innerHTML = `<div class="table-wrap"><table>
        <thead><tr><th>Person</th><th>Type</th><th>Date</th><th class="num">Amount</th>
          <th class="num">Paid / Received</th><th class="num">Remaining</th><th></th></tr></thead>
        <tbody>${rows.map(l => {
          const remaining = Calc.loanRemaining(l);
          return `<tr>
            <td><a href="#loans/${l.id}"><strong>${esc(l.person)}</strong></a>${l.description ? `<br><small class="muted">${esc(l.description)}</small>` : ""}</td>
            <td><span class="badge ${l.type === "borrowed" ? "badge-out" : "badge-in"}">${l.type === "borrowed" ? "Borrowed" : "Given"}</span></td>
            <td>${fmtDate(l.date)}</td>
            <td class="num">${money(l.amount)}</td>
            <td class="num">${money(Calc.loanPaid(l))}</td>
            <td class="num"><strong>${remaining <= 0 ? "Fully paid" : money(remaining)}</strong></td>
            <td class="actions">
              <button class="btn btn-small" data-act="view" data-id="${l.id}">Open</button>
              <button class="btn btn-small" data-act="edit" data-id="${l.id}">Edit</button>
              <button class="btn btn-small btn-danger-outline" data-act="delete" data-id="${l.id}">Delete</button>
            </td></tr>`;
        }).join("")}</tbody></table></div>`;
    };
    $$("[data-search],[data-type]", el).forEach(i => i.addEventListener("input", draw));
    draw();

    el.addEventListener("click", e => {
      const btn = e.target.closest("[data-act]");
      if (!btn) return;
      const id = btn.dataset.id;
      if (btn.dataset.act === "add") this.addLoan();
      if (btn.dataset.act === "view") App.go("loans", id);
      if (btn.dataset.act === "edit") this.editLoan(id);
      if (btn.dataset.act === "delete") this.deleteLoan(id);
    });

    if (action === "add") this.addLoan();
    if (action === "pay") this.quickRepayment();
  },

  async addLoan() {
    const v = await UI.form({ title: "Add Loan", fields: this.loanFields(), values: { date: todayISO(), type: "borrowed" } });
    if (!v) return;
    Store.add("loans", { person: v.person, type: v.type, amount: round2(v.amount), date: v.date,
                         description: v.description, payments: [] });
    UI.toast("Loan saved successfully.");
    this.refresh();
  },

  async editLoan(id) {
    const loan = Store.find("loans", id);
    const v = await UI.form({ title: "Edit Loan", fields: this.loanFields(), values: loan });
    if (!v) return;
    if (v.amount < Calc.loanPaid(loan)) {
      await UI.alert("The amount cannot be less than what is already paid (" + money(Calc.loanPaid(loan)) + ").");
      return;
    }
    Store.update("loans", id, { person: v.person, type: v.type, amount: round2(v.amount), date: v.date, description: v.description });
    UI.toast("Loan updated successfully.");
    this.refresh();
  },

  async deleteLoan(id) {
    const loan = Store.find("loans", id);
    const n = loan.payments.length;
    const message = "Are you sure you want to delete the loan of " + loan.person + " (" + money(loan.amount) + ")?" +
      (n ? " Its " + n + " payment" + (n === 1 ? "" : "s") + " will be deleted too." : "");
    if (!(await UI.confirmDelete(message))) return;
    Store.remove("loans", id);
    UI.toast("Loan deleted.");
    if (this.id === id) App.go("loans");
    else this.refresh();
  },

  /* Dashboard "Add Payment" -> "Loan repayment": pick the loan, then enter the payment. */
  async quickRepayment() {
    const open = Store.list("loans").filter(l => Calc.loanRemaining(l) > 0);
    if (!open.length) {
      await UI.alert("There is no loan with a remaining balance.");
      return;
    }
    const v = await UI.form({
      title: "Loan Repayment",
      values: { date: todayISO() },
      fields: [
        { name: "loanId", label: "Loan", type: "select", required: true,
          options: open.map(l => [l.id, this.typeText(l) + " " + l.person + " - remaining " + money(Calc.loanRemaining(l))]) },
        { name: "date", label: "Date", type: "date", required: true },
        { name: "amount", label: "Amount", type: "number", required: true },
        { name: "note", label: "Note" }
      ]
    });
    if (!v) return;
    if (!(await this.savePayment(v.loanId, null, v))) return;
    App.go("loans", v.loanId);
  },

  /* ----- one loan ----- */

  renderDetail() {
    const el = this.el;
    const loan = Store.find("loans", this.id);
    const borrowed = loan.type === "borrowed";
    const remaining = Calc.loanRemaining(loan);
    const payments = loan.payments.slice().sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : (a.created || 0) - (b.created || 0)));

    setPrintFooter("Loan: " + loan.person);
    el.innerHTML = `
      <a href="#loans" class="back-link no-print">&larr; Back to Loans</a>
      ${printHeader("Loan: " + loan.person)}
      <div class="page-head">
        <div><h1>${esc(loan.person)}</h1>
          <p class="muted">${borrowed ? "Money borrowed from this person" : "Money given to this person"} on ${fmtDate(loan.date)}</p>
          ${loan.description ? `<p class="muted">${esc(loan.description)}</p>` : ""}</div>
        <div class="btn-row no-print">
          ${remaining > 0 ? `<button class="btn btn-success" data-act="pay">${borrowed ? "Pay Back" : "Receive Repayment"}</button>` : ""}
          <button class="btn" data-act="edit">Edit Loan</button>
          <button class="btn" data-act="print">Print</button>
        </div>
      </div>
      <div class="cards cards-3">
        <div class="stat blue"><div class="stat-label">Loan Amount</div><div class="stat-value">${money(loan.amount)}</div></div>
        <div class="stat green"><div class="stat-label">${borrowed ? "Paid back" : "Received back"}</div><div class="stat-value">${money(Calc.loanPaid(loan))}</div></div>
        <div class="stat ${remaining > 0 ? "amber" : "green"}"><div class="stat-label">Remaining</div>
          <div class="stat-value">${remaining > 0 ? money(remaining) : "Fully paid"}</div></div>
      </div>
      <div class="card"><h2>Payments</h2>
        ${payments.length ? `<div class="table-wrap"><table>
          <thead><tr><th>Date</th><th class="num">Amount</th><th>Note</th><th class="no-print"></th></tr></thead>
          <tbody>${payments.map(p => `<tr>
            <td>${fmtDate(p.date)}</td><td class="num">${money(p.amount)}</td><td>${esc(p.note)}</td>
            <td class="actions no-print">
              <button class="btn btn-small" data-act="edit-pay" data-id="${p.id}">Edit</button>
              <button class="btn btn-small btn-danger-outline" data-act="delete-pay" data-id="${p.id}">Delete</button>
            </td></tr>`).join("")}</tbody></table></div>`
        : `<p class="empty">No payments yet.</p>`}
      </div>`;

    el.addEventListener("click", e => {
      const btn = e.target.closest("[data-act]");
      if (!btn) return;
      const act = btn.dataset.act;
      if (act === "pay") this.addPayment();
      if (act === "edit") this.editLoan(loan.id);
      if (act === "print") window.print();
      if (act === "edit-pay") this.editPayment(btn.dataset.id);
      if (act === "delete-pay") this.deletePayment(btn.dataset.id);
    });
  },

  paymentFields() {
    return [
      { name: "date", label: "Date", type: "date", required: true },
      { name: "amount", label: "Amount", type: "number", required: true },
      { name: "note", label: "Note", placeholder: "e.g. Cash" }
    ];
  },

  /* Saves a new payment (paymentId null) or changes one. Never lets payments pass the loan amount. */
  async savePayment(loanId, paymentId, v) {
    const loan = Store.find("loans", loanId);
    const others = loan.payments.filter(p => p.id !== paymentId).reduce((sum, p) => sum + p.amount, 0);
    const allowed = round2(loan.amount - others);
    if (v.amount > allowed + 0.001) {
      await UI.alert("This payment is more than the remaining balance (" + money(allowed) + ").");
      return false;
    }
    if (paymentId) {
      const p = loan.payments.find(x => x.id === paymentId);
      Object.assign(p, { date: v.date, amount: round2(v.amount), note: v.note });
    } else {
      loan.payments.push({ id: Store.newId("loans").replace("loan_", "pay_"), date: v.date,
                           amount: round2(v.amount), note: v.note || "", created: Date.now() });
    }
    Store.save();
    UI.toast("Payment saved successfully.");
    return true;
  },

  async addPayment() {
    const loan = Store.find("loans", this.id);
    const v = await UI.form({
      title: loan.type === "borrowed" ? "Pay Back" : "Receive Repayment",
      values: { date: todayISO() },
      fields: this.paymentFields()
    });
    if (!v) return;
    if (await this.savePayment(this.id, null, v)) this.refresh();
  },

  async editPayment(paymentId) {
    const loan = Store.find("loans", this.id);
    const p = loan.payments.find(x => x.id === paymentId);
    const v = await UI.form({ title: "Edit Payment", values: p, fields: this.paymentFields() });
    if (!v) return;
    if (await this.savePayment(this.id, paymentId, v)) this.refresh();
  },

  async deletePayment(paymentId) {
    if (!(await UI.confirmDelete("Are you sure you want to delete this payment?"))) return;
    const loan = Store.find("loans", this.id);
    loan.payments = loan.payments.filter(p => p.id !== paymentId);
    Store.save();
    UI.toast("Payment deleted.");
    this.refresh();
  }
};
