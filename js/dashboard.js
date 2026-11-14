/* dashboard.js - today's summary, quick buttons and recent transactions */

App.pages.dashboard = {
  title: "Dashboard",

  render(el) {
    const today = todayISO();
    const s = Calc.summary(today, today);
    const cards = [
      { label: "Today's Income", value: s.income, color: "green",
        note: "Cash " + money(s.income_cash) + " | Credit " + money(s.income_credit) },
      { label: "Today's Expenses", value: s.expenses, color: "red", note: "Money spent today" },
      { label: "Customer Credit", value: Calc.customerCredit(), color: "amber", note: "Customers still have to pay" },
      { label: "Supplier Payable", value: Calc.supplierPayable(), color: "amber", note: "You still have to pay suppliers" },
      { label: "Cash Balance", value: Calc.cashBalanceOn(today), color: "blue", note: "Cash in hand today" }
    ];
    const stockAlerts = Store.list("products").map(p => ({ p, s: Calc.stockOf(p.id) })).filter(r => r.s.status !== "ok");
    const recent = Calc.entries().slice(0, 10);

    el.innerHTML = `
      ${this.backupReminder()}
      <div class="page-head"><h1>Dashboard</h1><span class="muted">${fmtDate(today)}</span></div>

      <div class="cards">${cards.map(c => `
        <div class="stat ${c.color}">
          <div class="stat-label">${c.label}</div>
          <div class="stat-value">${money(c.value)}</div>
          <div class="stat-note">${esc(c.note)}</div>
        </div>`).join("")}
      </div>

      ${stockAlerts.length ? `<div class="alert alert-warn no-print"><strong>Stock alert:</strong> ${stockAlerts.slice(0, 6).map(r =>
        esc(r.p.name) + " (" + (r.s.status === "out" ? "finished" : fmtQty(r.s.remaining) + " " + esc(r.p.unit) + " left") + ")").join(", ")}${stockAlerts.length > 6 ? " and " + (stockAlerts.length - 6) + " more" : ""}.
        <a href="#stock">Open Stock</a></div>` : ""}

      <div class="card">
        <h2>Quick Actions</h2>
        <div class="btn-row">
          <button class="btn btn-primary" data-act="income">+ Add Income</button>
          <button class="btn btn-primary" data-act="expense">+ Add Expense</button>
          <button class="btn btn-primary" data-act="customer">+ Add Customer</button>
          <button class="btn btn-primary" data-act="payment">+ Add Payment</button>
          <button class="btn btn-primary" data-act="loan">+ Add Loan</button>
          <button class="btn btn-primary" data-act="product">+ Add Product</button>
        </div>
      </div>

      <div class="card">
        <h2>Recent Transactions</h2>
        ${recent.length ? `<div class="table-wrap"><table>
          <thead><tr><th>Date</th><th>Type</th><th>Description</th><th class="num">Amount</th></tr></thead>
          <tbody>${recent.map(e => `<tr>
            <td>${fmtDate(e.date)}</td><td>${typeBadge(e)}</td>
            <td>${esc(Calc.describe(e))}</td><td class="num">${money(e.amount)}</td></tr>`).join("")}
          </tbody></table></div>`
        : `<p class="empty">Nothing recorded yet. Use the buttons above to add your first entry.</p>`}
      </div>`;

    const resume = $("[data-resume-backup]", el);
    if (resume) resume.addEventListener("click", () => AutoBackup.resume());

    el.addEventListener("click", async e => {
      const btn = e.target.closest("[data-act]");
      if (!btn) return;
      const act = btn.dataset.act;
      if (act === "income") App.go("income", null, "focus");
      if (act === "expense") App.go("expenses", null, "focus");
      if (act === "customer") App.go("customers", null, "add");
      if (act === "loan") App.go("loans", null, "add");
      if (act === "product") App.go("stock", null, "focus");
      if (act === "payment") {
        const choice = await UI.choose("What kind of payment?", [
          ["Receive payment from a customer", "customer"],
          ["Pay a supplier", "supplier"],
          ["Loan repayment", "loan"]
        ]);
        if (choice === "customer") App.go("customers", null, "pay");
        if (choice === "supplier") App.go("suppliers", null, "pay");
        if (choice === "loan") App.go("loans", null, "pay");
      }
    });
  },

  /* Reminder about backups. With automatic backup ON nothing is shown. */
  backupReminder() {
    const d = Store.data;
    const hasRecords = DATA_COLLECTIONS.some(c => d[c].length > 0);
    if (!hasRecords) return "";
    const b = AutoBackup;
    if (b.status === "on") return "";
    if (b.status === "needs-permission") {
      return `<div class="alert alert-warn no-print">Automatic backup is paused until the browser gets your permission again.
        <button type="button" class="btn btn-small" data-resume-backup>Resume Automatic Backup</button></div>`;
    }
    if (b.supported) {
      return `<div class="alert alert-warn no-print">${b.status === "error" ? esc(b.message) + " " : ""}Automatic backup is not turned on, so your records
        exist only in this browser. ${Auth.isOwner() ? `<a href="#backup">Turn on automatic backup</a>` : "Please ask the owner to turn it on."}</div>`;
    }
    const last = d.settings.lastBackup ? new Date(d.settings.lastBackup).getTime() : 0;
    const days = (Date.now() - last) / 86400000;
    if (last && days < 7) return "";
    const text = last ? "Your last backup was " + Math.floor(days) + " days ago." : "You have not made a backup yet.";
    return `<div class="alert alert-warn no-print">${text} This browser cannot back up automatically.
      ${Auth.isOwner() ? `<a href="#backup">Download a backup</a>` : "Please ask the owner to download a backup"} to keep your records safe.</div>`;
  }
};
