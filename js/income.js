/* income.js - daily sales (cash or credit) */

App.pages.income = {
  title: "Income / Sales",

  render(el) {
    this.el = el;
    this.editId = null;
    const customers = Store.list("customers").slice().sort((a, b) => a.name.localeCompare(b.name));

    el.innerHTML = `
      <div class="page-head"><h1>Income / Sales</h1></div>
      <div class="card">
        <h2 data-title>Add Income</h2>
        <form data-form class="form-grid" novalidate>
          <label>Date<input type="date" name="date" required></label>
          <label>Amount<input type="number" name="amount" min="0" step="any" inputmode="decimal" placeholder="e.g. 5000" required></label>
          <label>Payment Type
            <select name="paymentMethod"><option value="cash">Cash</option><option value="credit">Credit</option></select></label>
          <label data-customer-box hidden>Customer (who owes you)
            <select name="customerId">
              <option value="">- No customer -</option>
              ${customers.map(c => `<option value="${c.id}">${esc(c.name)}</option>`).join("")}
            </select></label>
          <label class="span-all">Description<input type="text" name="description" placeholder="e.g. Hardware items"></label>
          <p class="form-error span-all" role="alert" hidden></p>
          <div class="btn-row span-all">
            <button type="submit" class="btn btn-primary" data-submit>Save Income</button>
            <button type="button" class="btn" data-cancel hidden>Cancel</button>
          </div>
        </form>
      </div>

      <div class="card">
        <h2>All Income</h2>
        <div class="filters">
          <label>Search<input type="search" data-search placeholder="Description, amount, date..."></label>
          <label>Payment<select data-pay><option value="">All</option><option value="cash">Cash</option><option value="credit">Credit</option></select></label>
          <label>From<input type="date" data-from></label>
          <label>To<input type="date" data-to></label>
        </div>
        <div data-list></div>
      </div>`;

    this.form = $("[data-form]", el);
    this.resetForm();

    this.form.elements.paymentMethod.addEventListener("change", () => this.toggleCustomer());
    this.form.addEventListener("submit", e => { e.preventDefault(); this.save(); });
    $("[data-cancel]", el).addEventListener("click", () => this.resetForm());
    $$("[data-search],[data-pay],[data-from],[data-to]", el).forEach(i => {
      i.addEventListener("input", () => this.drawList());
    });
    $("[data-list]", el).addEventListener("click", e => {
      const btn = e.target.closest("[data-act]");
      if (!btn) return;
      if (btn.dataset.act === "edit") this.startEdit(btn.dataset.id);
      if (btn.dataset.act === "delete") this.remove(btn.dataset.id);
    });

    this.drawList();
    if (App.takeAction("income") === "focus") this.form.elements.amount.focus();
  },

  toggleCustomer() {
    const credit = this.form.elements.paymentMethod.value === "credit";
    $("[data-customer-box]", this.el).hidden = !credit;
    if (!credit) this.form.elements.customerId.value = "";
  },

  resetForm() {
    this.editId = null;
    this.form.reset();
    this.form.elements.date.value = todayISO();
    $("[data-title]", this.el).textContent = "Add Income";
    $("[data-submit]", this.el).textContent = "Save Income";
    $("[data-cancel]", this.el).hidden = true;
    $(".form-error", this.form).hidden = true;
    this.toggleCustomer();
  },

  startEdit(id) {
    const r = Store.find("income", id);
    if (!r) return;
    this.editId = id;
    const f = this.form.elements;
    f.date.value = r.date;
    f.amount.value = r.amount;
    f.paymentMethod.value = r.paymentMethod === "credit" ? "credit" : "cash";
    this.toggleCustomer();
    f.customerId.value = r.customerId || "";
    f.description.value = r.description || "";
    $("[data-title]", this.el).textContent = "Edit Income";
    $("[data-submit]", this.el).textContent = "Update Income";
    $("[data-cancel]", this.el).hidden = false;
    $(".form-error", this.form).hidden = true;
    window.scrollTo(0, 0);
    f.amount.focus();
  },

  save() {
    const f = this.form.elements;
    const amount = Number(f.amount.value);
    const error = $(".form-error", this.form);
    if (!f.date.value) { error.textContent = "Please choose a date."; error.hidden = false; return; }
    if (!(amount > 0)) { error.textContent = "Please enter an amount more than zero."; error.hidden = false; return; }

    const credit = f.paymentMethod.value === "credit";
    const record = {
      date: f.date.value,
      amount: round2(amount),
      paymentMethod: credit ? "credit" : "cash",
      customerId: credit ? f.customerId.value : "",
      description: f.description.value.trim()
    };
    if (this.editId) Store.update("income", this.editId, record);
    else Store.add("income", record);
    UI.toast(this.editId ? "Transaction updated successfully." : "Transaction saved successfully.");
    this.resetForm();
    this.drawList();
  },

  async remove(id) {
    if (!(await UI.confirmDelete("Are you sure you want to delete this transaction?"))) return;
    Store.remove("income", id);
    UI.toast("Transaction deleted.");
    if (this.editId === id) this.resetForm();
    this.drawList();
  },

  drawList() {
    const q = $("[data-search]", this.el).value;
    const pay = $("[data-pay]", this.el).value;
    const from = $("[data-from]", this.el).value;
    const to = $("[data-to]", this.el).value;

    const rows = Store.list("income").filter(r => {
      const method = r.paymentMethod === "credit" ? "credit" : "cash";
      const customer = r.customerId && Store.find("customers", r.customerId);
      return inRange(r.date, from, to) && (!pay || method === pay) &&
        matches(q, [r.description, r.amount, fmtDate(r.date), r.date, method, "income", customer ? customer.name : ""]);
    }).sort(byDateDesc);

    const list = $("[data-list]", this.el);
    if (!rows.length) {
      list.innerHTML = `<p class="empty">${Store.list("income").length ? "No match found." : "No income recorded yet."}</p>`;
      return;
    }
    const total = rows.reduce((sum, r) => sum + r.amount, 0);
    list.innerHTML = `<div class="table-wrap"><table>
      <thead><tr><th>Date</th><th>Description</th><th>Payment</th><th>Customer</th><th class="num">Amount</th><th></th></tr></thead>
      <tbody>${rows.map(r => {
        const customer = r.customerId && Store.find("customers", r.customerId);
        return `<tr>
          <td>${fmtDate(r.date)}</td>
          <td>${esc(r.description)}</td>
          <td><span class="badge ${r.paymentMethod === "credit" ? "badge-credit" : "badge-in"}">${r.paymentMethod === "credit" ? "Credit" : "Cash"}</span></td>
          <td>${customer ? esc(customer.name) : ""}</td>
          <td class="num">${money(r.amount)}</td>
          <td class="actions">
            <button class="btn btn-small" data-act="edit" data-id="${r.id}">Edit</button>
            <button class="btn btn-small btn-danger-outline" data-act="delete" data-id="${r.id}">Delete</button>
          </td></tr>`;
      }).join("")}</tbody></table></div>
      <p class="list-total">${rows.length} record${rows.length === 1 ? "" : "s"} | Total: <strong>${money(total)}</strong></p>`;
  }
};
