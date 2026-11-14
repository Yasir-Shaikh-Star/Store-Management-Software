/* parties.js
   Customers and suppliers work almost the same way (a name, a balance, credits/bills and payments),
   so both pages are made by this one function. See customers.js and suppliers.js. */

function makePartyPage(cfg) {
  const kind = cfg.kind;
  const partyFields = [
    { name: "name", label: cfg.single + " Name", required: true },
    { name: "phone", label: "Phone", type: "tel" },
    { name: "address", label: "Address" },
    { name: "notes", label: "Notes", type: "textarea" }
  ];

  const page = {
    title: cfg.title,

    render(el, id) {
      this.el = el;
      this.id = id && Store.find(cfg.collection, id) ? id : null;
      const action = App.takeAction(cfg.page);
      if (this.id) this.renderDetail();
      else this.renderList(action);
    },

    refresh() {
      App.render(); // draws the page again on a fresh wrapper
    },

    /* ----- list of all customers / suppliers ----- */

    renderList(action) {
      const el = this.el;
      el.innerHTML = `
        <div class="page-head"><h1>${cfg.title}</h1>
          <button class="btn btn-primary" data-act="add">+ Add ${cfg.single}</button></div>
        <div class="card">
          <div class="filters"><label>Search<input type="search" data-search placeholder="Search by name or phone"></label></div>
          <div data-list></div>
        </div>`;
      const search = $("[data-search]", el);
      const list = $("[data-list]", el);

      const draw = () => {
        const rows = Store.list(cfg.collection)
          .filter(p => matches(search.value, [p.name, p.phone]))
          .sort((a, b) => a.name.localeCompare(b.name));
        let total = 0;
        const body = rows.map(p => {
          const t = Calc.partyTotals(kind, p.id);
          total += t.remaining;
          return `<tr>
            <td><a href="#${cfg.page}/${p.id}"><strong>${esc(p.name)}</strong></a></td>
            <td>${esc(p.phone)}</td>
            <td class="num">${money(t.charged)}</td>
            <td class="num">${money(t.paid)}</td>
            <td class="num"><strong>${money(t.remaining)}</strong></td>
            <td class="actions">
              <button class="btn btn-small" data-act="view" data-id="${p.id}">Open</button>
              <button class="btn btn-small" data-act="edit" data-id="${p.id}">Edit</button>
              <button class="btn btn-small btn-danger-outline" data-act="delete" data-id="${p.id}">Delete</button>
            </td></tr>`;
        }).join("");

        if (!rows.length) {
          list.innerHTML = `<p class="empty">${Store.list(cfg.collection).length
            ? "No match found." : cfg.emptyText}</p>`;
          return;
        }
        list.innerHTML = `<div class="table-wrap"><table>
          <thead><tr><th>Name</th><th>Phone</th><th class="num">${cfg.totalLabel}</th>
            <th class="num">${cfg.paidLabel}</th><th class="num">Remaining</th><th></th></tr></thead>
          <tbody>${body}</tbody></table></div>
          <p class="list-total">Total remaining: <strong>${money(total)}</strong></p>`;
      };
      search.addEventListener("input", draw);
      draw();

      el.addEventListener("click", async e => {
        const btn = e.target.closest("[data-act]");
        if (!btn) return;
        const id = btn.dataset.id;
        if (btn.dataset.act === "add") this.addParty();
        if (btn.dataset.act === "view") App.go(cfg.page, id);
        if (btn.dataset.act === "edit") this.editParty(id);
        if (btn.dataset.act === "delete") this.deleteParty(id);
      });

      if (action === "add") this.addParty();
      if (action === "pay") this.quickPayment();
    },

    async addParty() {
      const v = await UI.form({ title: "Add " + cfg.single, fields: partyFields });
      if (!v) return;
      Store.add(cfg.collection, v);
      UI.toast(cfg.single + " saved successfully.");
      this.refresh();
    },

    async editParty(id) {
      const v = await UI.form({ title: "Edit " + cfg.single, fields: partyFields, values: Store.find(cfg.collection, id) });
      if (!v) return;
      Store.update(cfg.collection, id, v);
      UI.toast(cfg.single + " updated successfully.");
      this.refresh();
    },

    async deleteParty(id) {
      const p = Store.find(cfg.collection, id);
      if (Calc.partyEntries(kind, id).length) {
        await UI.alert(p.name + " has saved records. To keep your books correct, please delete those records first (open " +
          cfg.single.toLowerCase() + " and delete each entry), then delete the " + cfg.single.toLowerCase() + ".", "Cannot delete");
        return;
      }
      if (!(await UI.confirmDelete("Are you sure you want to delete " + p.name + "?"))) return;
      Store.remove(cfg.collection, id);
      UI.toast(cfg.single + " deleted.");
      this.refresh();
    },

    /* Used by the dashboard "Add Payment" button: pick the person, then enter the payment. */
    async quickPayment() {
      const parties = Store.list(cfg.collection);
      if (!parties.length) {
        await UI.alert("Please add a " + cfg.single.toLowerCase() + " first.");
        return;
      }
      const v = await UI.form({
        title: cfg.payBtn,
        values: { date: todayISO() },
        fields: [
          { name: "partyId", label: cfg.single, type: "select", required: true,
            options: parties.slice().sort((a, b) => a.name.localeCompare(b.name)).map(p => [p.id, p.name]) },
          { name: "date", label: "Date", type: "date", required: true },
          { name: "amount", label: "Amount", type: "number", required: true },
          { name: "description", label: "Description", placeholder: "e.g. Cash" }
        ]
      });
      if (!v) return;
      if (!(await this.checkOverpay(v.partyId, v.amount))) return;
      Calc.addPartyPayment(kind, v.partyId, v);
      UI.toast("Payment saved successfully.");
      App.go(cfg.page, v.partyId);
    },

    /* Asks before saving a payment bigger than what is owed. */
    async checkOverpay(id, amount) {
      const remaining = Calc.partyTotals(kind, id).remaining;
      if (amount <= remaining + 0.001) return true;
      return UI.confirm("This payment (" + money(amount) + ") is more than the remaining balance (" + money(remaining) +
        "). Save anyway?", { okText: "Save anyway" });
    },

    /* ----- one customer / supplier ----- */

    renderDetail() {
      const el = this.el;
      const p = Store.find(cfg.collection, this.id);
      const t = Calc.partyTotals(kind, p.id);
      const contact = [p.phone, p.address].filter(Boolean).join(" | ");
      let balance = 0;
      const rows = Calc.partyEntries(kind, p.id).map(e => {
        balance = round2(balance + (e.type === "charge" ? e.amount : -e.amount));
        return `<tr>
          <td>${fmtDate(e.date)}</td>
          <td><span class="badge ${e.type === "charge" ? "badge-credit" : "badge-in"}">${e.type === "charge" ? cfg.chargeWord : "Payment"}</span></td>
          <td class="num">${money(e.amount)}</td>
          <td>${esc(e.description)}</td>
          <td class="num">${money(balance)}</td>
          <td class="actions no-print">
            <button class="btn btn-small" data-act="edit-entry" data-id="${e.id}">Edit</button>
            <button class="btn btn-small btn-danger-outline" data-act="delete-entry" data-id="${e.id}">Delete</button>
          </td></tr>`;
      }).join("");

      setPrintFooter(cfg.single + " statement: " + p.name);
      el.innerHTML = `
        <a href="#${cfg.page}" class="back-link no-print">&larr; Back to ${cfg.title}</a>
        ${printHeader(cfg.single + " statement: " + p.name)}
        <div class="page-head">
          <div><h1>${esc(p.name)}</h1>
            ${contact ? `<p class="muted">${esc(contact)}</p>` : ""}
            ${p.notes ? `<p class="muted">${esc(p.notes)}</p>` : ""}</div>
          <div class="btn-row no-print">
            <button class="btn btn-primary" data-act="charge">${cfg.chargeBtn}</button>
            <button class="btn btn-success" data-act="payment">${cfg.payBtn}</button>
            <button class="btn" data-act="print">Print</button>
          </div>
        </div>
        <div class="cards cards-3">
          <div class="stat amber"><div class="stat-label">${cfg.totalLabel}</div><div class="stat-value">${money(t.charged)}</div></div>
          <div class="stat green"><div class="stat-label">${cfg.paidLabel}</div><div class="stat-value">${money(t.paid)}</div></div>
          <div class="stat blue"><div class="stat-label">${t.remaining < 0 ? "Paid in advance" : "Remaining"}</div>
            <div class="stat-value">${money(Math.abs(t.remaining))}</div></div>
        </div>
        <div class="card"><h2>Transaction History</h2>
          ${rows ? `<div class="table-wrap"><table>
            <thead><tr><th>Date</th><th>Type</th><th class="num">Amount</th><th>Description</th><th class="num">Balance</th><th class="no-print"></th></tr></thead>
            <tbody>${rows}</tbody></table></div>
            <p class="list-total">Balance: <strong>${money(t.remaining)}</strong></p>`
          : `<p class="empty">No entries yet.</p>`}
        </div>`;

      el.addEventListener("click", e => {
        const btn = e.target.closest("[data-act]");
        if (!btn) return;
        const act = btn.dataset.act;
        if (act === "charge") this.addEntry("charge");
        if (act === "payment") this.addEntry("payment");
        if (act === "print") window.print();
        if (act === "edit-entry") this.editEntry(btn.dataset.id);
        if (act === "delete-entry") this.deleteEntry(btn.dataset.id);
      });
    },

    entryFields() {
      return [
        { name: "date", label: "Date", type: "date", required: true },
        { name: "amount", label: "Amount", type: "number", required: true },
        { name: "description", label: "Description", placeholder: "e.g. Hardware items" }
      ];
    },

    async addEntry(type) {
      const v = await UI.form({
        title: type === "charge" ? cfg.chargeBtn : cfg.payBtn,
        values: { date: todayISO() },
        fields: this.entryFields()
      });
      if (!v) return;
      if (type === "charge") {
        Calc.addPartyCharge(kind, this.id, v);
      } else {
        if (!(await this.checkOverpay(this.id, v.amount))) return;
        Calc.addPartyPayment(kind, this.id, v);
      }
      UI.toast("Transaction saved successfully.");
      this.refresh();
    },

    async editEntry(entryId) {
      const entry = Calc.partyEntries(kind, this.id).find(e => e.id === entryId);
      if (!entry) return;
      const v = await UI.form({ title: "Edit Entry", values: entry, fields: this.entryFields() });
      if (!v) return;
      Store.update(entry.collection, entry.id, { date: v.date, amount: round2(v.amount), description: v.description });
      UI.toast("Transaction updated successfully.");
      this.refresh();
    },

    async deleteEntry(entryId) {
      const entry = Calc.partyEntries(kind, this.id).find(e => e.id === entryId);
      if (!entry) return;
      if (!(await UI.confirmDelete("Are you sure you want to delete this transaction?"))) return;
      Store.remove(entry.collection, entry.id);
      UI.toast("Transaction deleted.");
      this.refresh();
    }
  };
  return page;
}
