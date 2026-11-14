/* reports.js - simple totals for a period, with a printable table */

App.pages.reports = {
  title: "Reports",

  render(el) {
    el.innerHTML = `
      <div class="page-head no-print"><h1>Reports</h1>
        <div class="btn-row">
          <button class="btn btn-primary" data-print>Print Report</button>
          <button class="btn" data-download>Download Report (PDF)</button>
        </div></div>
      <div class="card no-print">${UI.periodHTML("month")}</div>
      <div data-shopinfo class="no-print"></div>
      <div data-body></div>`;

    const getRange = UI.bindPeriod(el, () => this.draw(el, getRange()));
    this.drawShopInfo(el);
    $("[data-print]", el).addEventListener("click", () => window.print());
    $("[data-download]", el).addEventListener("click", () => {
      const c = this.current;
      Report.download(c.blocks, "Financial Report", c.ranged, c.range);
    });
    this.draw(el, getRange());
  },

  draw(el, range) {
    const s = Calc.summary(range.from, range.to);
    const loans = Calc.loanTotals();
    const endDate = range.to || todayISO();
    const ranged = range.from || range.to
      ? (range.from ? fmtDate(range.from) : "start") + " to " + (range.to ? fmtDate(range.to) : "today")
      : "All dates";

    const box = (label, value, note, color) => `<div class="stat ${color || "blue"}">
      <div class="stat-label">${label}</div><div class="stat-value">${value}</div>
      ${note ? `<div class="stat-note">${note}</div>` : ""}</div>`;

    const rows = Calc.entries().filter(e => inRange(e.date, range.from, range.to));

    const typeRows = rows.map((e, i) => [String(i + 1), fmtDate(e.date), KINDS[e.kind].label, Calc.describe(e), money(e.amount)]);
    const blocks = [
      { t: "h", text: "Summary for the period" },
      { t: "rows", rows: [
        ["Total Income", money(s.income), "b"],
        ["Cash sales", money(s.income_cash), "sub"],
        ["Credit sales", money(s.income_credit), "sub"],
        ["Total Expenses", money(s.expenses), "b"],
        ["Customer Payments Received", money(s.customer_payment)],
        ["Supplier Payments Made", money(s.supplier_payment)],
        ["Money Borrowed", money(s.loan_borrowed)],
        ["Money Given", money(s.loan_given)]] },
      { t: "h", text: "Net Recorded Income" },
      { t: "rows", rows: [
        ["Income", money(s.income)],
        ["Recorded Expenses", "- " + money(s.expenses)],
        ["Net Recorded Income", money(s.netRecorded), "total"]] },
      { t: "note", text: "Basic calculation of recorded entries only. It is not the actual profit of the shop, because the cost of goods purchased is not recorded." },
      { t: "h", text: "Balances" },
      { t: "rows", rows: [
        ["Outstanding Customer Credit (today)", money(Calc.customerCredit())],
        ["Outstanding Supplier Payments (today)", money(Calc.supplierPayable())],
        ["Loans - amount you still owe", money(loans.owe)],
        ["Loans - amount owed to you", money(loans.owed)],
        ["Cash Balance at end of " + fmtDate(endDate), money(Calc.cashBalanceOn(endDate)), "total"]] },
      { t: "h", text: "Transactions (" + rows.length + ")" },
      rows.length ? { t: "table", cols: [
        { h: "#", w: 0.06, align: "c" }, { h: "Date", w: 0.15 }, { h: "Type", w: 0.2 },
        { h: "Description", w: 0.4 }, { h: "Amount", w: 0.19, align: "r" }], rows: typeRows }
        : { t: "note", text: "No transactions in this period." },
      { t: "sign" }
    ];
    this.current = { blocks, ranged, range };
    const sheet = printFrame(printHeader("Financial Report", ranged), Report.toHTML(blocks));
    setPrintFooter("Financial Report: " + ranged);

    $("[data-body]", el).innerHTML = sheet + `<div class="screen-only">
      <div class="cards">
        ${box("Total Income", money(s.income), "Cash " + money(s.income_cash) + " | Credit " + money(s.income_credit), "green")}
        ${box("Total Expenses", money(s.expenses), "", "red")}
        ${box("Customer Payments", money(s.customer_payment), "", "green")}
        ${box("Supplier Payments", money(s.supplier_payment), "", "red")}
        ${box("Money Borrowed", money(s.loan_borrowed), "", "blue")}
        ${box("Money Given", money(s.loan_given), "", "blue")}
        ${box("Outstanding Customer Credit", money(Calc.customerCredit()), "Total right now", "amber")}
        ${box("Outstanding Supplier Payments", money(Calc.supplierPayable()), "Total right now", "amber")}
        ${box("Loan Balances", "", "You owe: <strong>" + money(loans.owe) + "</strong><br>Owed to you: <strong>" + money(loans.owed) + "</strong>", "amber")}
        ${box("Cash Balance", money(Calc.cashBalanceOn(endDate)), "At end of " + fmtDate(endDate), "blue")}
      </div>

      <div class="card net-box">
        <h2>Net Recorded Income</h2>
        <table class="cash-sum"><tbody>
          <tr><td>Income</td><td class="num">${money(s.income)}</td></tr>
          <tr><td>Recorded Expenses</td><td class="num">&minus; ${money(s.expenses)}</td></tr>
          <tr class="total"><td>Net Recorded Income</td><td class="num">${money(s.netRecorded)}</td></tr>
        </tbody></table>
        <p class="muted">This is only a basic calculation of the entries recorded here. It is <strong>not</strong> the
          real profit of the shop, because the cost of the goods you buy is not recorded in this software.</p>
      </div>

      <div class="card">
        <h2>Transactions <small class="muted">${esc(ranged)}</small></h2>
        ${rows.length ? `<div class="table-wrap"><table>
          <thead><tr><th>Date</th><th>Type</th><th>Description</th><th class="num">Amount</th></tr></thead>
          <tbody>${rows.map(e => `<tr><td>${fmtDate(e.date)}</td><td>${typeBadge(e)}</td>
            <td>${esc(Calc.describe(e))}</td><td class="num">${money(e.amount)}</td></tr>`).join("")}</tbody></table></div>
          <p class="list-total">${rows.length} transaction${rows.length === 1 ? "" : "s"}</p>`
        : `<p class="empty">No transactions in this period.</p>`}
      </div></div>`;
  },

  /* Shows the address/phone that will be printed, with a button for the owner to change them. */
  drawShopInfo(el) {
    const s = Store.data.settings;
    const missing = !s.address || !s.phone;
    const box = $("[data-shopinfo]", el);
    box.innerHTML = `<div class="alert ${missing ? "alert-warn" : "alert-info"}">
      <strong>Printed on the report:</strong> ${esc(s.shopName)}
      | Address: ${s.address ? esc(s.address) : "<em>not added</em>"}
      | Phone: ${s.phone ? esc(s.phone) : "<em>not added</em>"}
      ${Auth.isOwner() ? ` <button type="button" class="btn btn-small" data-edit-shop>Edit Shop Details</button>`
        : ` <span class="muted">(only the owner can change this)</span>`}
    </div>`;
    const btn = $("[data-edit-shop]", box);
    if (btn) btn.addEventListener("click", async () => {
      const v = await UI.form({
        title: "Shop details for printed reports",
        values: s,
        fields: [
          { name: "shopName", label: "Shop Name", required: true },
          { name: "ownerName", label: "Owner Name" },
          { name: "phone", label: "Phone Number", type: "tel" },
          { name: "address", label: "Shop Address" }
        ]
      });
      if (!v) return;
      Object.assign(Store.data.settings, { shopName: v.shopName, ownerName: v.ownerName, phone: v.phone, address: v.address });
      Store.save();
      App.refreshBrand();
      UI.toast("Shop details saved successfully.");
      App.render();
    });
  }
};
