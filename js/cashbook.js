/* cashbook.js - how much cash came in, went out, and what is in hand */

App.pages.cashbook = {
  title: "Cash Book",

  render(el) {
    el.innerHTML = `
      <div class="page-head no-print"><h1>Cash Book</h1>
        <div class="btn-row">
          <button class="btn btn-primary" data-print>Print</button>
          <button class="btn" data-download>Download Report (PDF)</button>
        </div></div>
      <div class="card no-print">${UI.periodHTML("month")}</div>
      <div data-body></div>`;

    const getRange = UI.bindPeriod(el, () => this.draw(el, getRange()));
    $("[data-print]", el).addEventListener("click", () => window.print());
    $("[data-download]", el).addEventListener("click", () => {
      const c = this.current;
      Report.download(c.blocks, "Cash Book Report", c.ranged, c.range);
    });
    this.draw(el, getRange());
  },

  draw(el, range) {
    const s = Calc.summary(range.from, range.to);
    const opening = Calc.cashBalanceBefore(range.from);
    const closing = round2(opening + s.cashIn - s.cashOut);
    const ranged = range.from || range.to
      ? (range.from ? fmtDate(range.from) : "start") + " to " + (range.to ? fmtDate(range.to) : "today")
      : "All dates";

    const line = (sign, label, value) => `<tr>
      <td class="sign">${sign}</td><td>${label}</td><td class="num">${money(value)}</td></tr>`;

    // Cash entries only, oldest first, with a running balance
    let running = opening;
    const cashEntries = Calc.entries().filter(e => e.cash !== 0 && inRange(e.date, range.from, range.to)).reverse();
    cashEntries.forEach(e => { running = round2(running + e.cash); e.balance = running; });
    const cashRows = cashEntries.map(e => {
      running = e.balance;
      return `<tr>
        <td>${fmtDate(e.date)}</td><td>${typeBadge(e)}</td><td>${esc(Calc.describe(e))}</td>
        <td class="num in">${e.cash > 0 ? money(e.cash) : ""}</td>
        <td class="num out">${e.cash < 0 ? money(-e.cash) : ""}</td>
        <td class="num">${money(running)}</td></tr>`;
    }).join("");

    const blocks = [
      { t: "h", text: "Cash Summary" },
      { t: "rows", rows: [
        ["Opening Balance", money(opening), "b"],
        ["+ Cash Income", money(s.income_cash)],
        ["+ Customer Payments", money(s.customer_payment)],
        ["+ Money Borrowed", money(s.loan_borrowed)],
        ["+ Loan Repayments Received", money(s.loan_received)],
        ["- Cash Expenses", money(s.expense)],
        ["- Supplier Payments", money(s.supplier_payment)],
        ["- Money Given", money(s.loan_given)],
        ["- Loan Repayments Paid", money(s.loan_repaid)],
        ["Closing Cash Balance", money(closing), "total"]] },
      { t: "note", text: "Credit sales and supplier bills are not cash, so they are not counted here." },
      { t: "h", text: "Cash Entries" },
      cashEntries.length ? { t: "table", cols: [
        { h: "#", w: 0.05, align: "c" }, { h: "Date", w: 0.13 }, { h: "Type", w: 0.17 }, { h: "Description", w: 0.25 },
        { h: "Cash In", w: 0.13, align: "r" }, { h: "Cash Out", w: 0.13, align: "r" }, { h: "Balance", w: 0.14, align: "r" }],
        rows: [["", "", "Opening balance", "", "", "", money(opening)]].concat(cashEntries.map((e, i) => [
          String(i + 1), fmtDate(e.date), KINDS[e.kind].label, Calc.describe(e),
          e.cash > 0 ? money(e.cash) : "", e.cash < 0 ? money(-e.cash) : "", money(e.balance)])) }
        : { t: "note", text: "No cash entries in this period." },
      { t: "sign" }
    ];
    this.current = { blocks, ranged, range };
    const sheetBody = Report.toHTML(blocks);
    setPrintFooter("Cash Book Report: " + ranged);

    $("[data-body]", el).innerHTML = printFrame(printHeader("Cash Book Report", ranged), sheetBody) + `<div class="screen-only">
      <div class="card">
        <h2>Cash Summary <small class="muted">${esc(ranged)}</small></h2>
        <div class="table-wrap"><table class="cash-sum"><tbody>
          <tr class="strong"><td></td><td>Opening Balance</td><td class="num">${money(opening)}</td></tr>
          ${line("+", "Cash Income", s.income_cash)}
          ${line("+", "Customer Payments", s.customer_payment)}
          ${line("+", "Money Borrowed", s.loan_borrowed)}
          ${line("+", "Loan Repayments Received", s.loan_received)}
          ${line("&minus;", "Cash Expenses", s.expense)}
          ${line("&minus;", "Supplier Payments", s.supplier_payment)}
          ${line("&minus;", "Money Given", s.loan_given)}
          ${line("&minus;", "Loan Repayments Paid", s.loan_repaid)}
          <tr class="total"><td>=</td><td>Current Cash Balance</td><td class="num">${money(closing)}</td></tr>
        </tbody></table></div>
        <p class="muted">Credit sales and supplier bills are not cash, so they are not counted here.
          The opening balance is set in <a href="#settings">Settings</a>.</p>
      </div>
      <div class="card">
        <h2>Cash Entries</h2>
        ${cashRows ? `<div class="table-wrap"><table>
          <thead><tr><th>Date</th><th>Type</th><th>Description</th><th class="num">Cash In</th><th class="num">Cash Out</th><th class="num">Balance</th></tr></thead>
          <tbody><tr class="muted-row"><td colspan="5">Opening balance</td><td class="num">${money(opening)}</td></tr>${cashRows}</tbody></table></div>`
        : `<p class="empty">No cash entries in this period.</p>`}
      </div></div>`;
  }
};
