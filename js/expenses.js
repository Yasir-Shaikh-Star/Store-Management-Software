/* expenses.js - money spent by the shop (rent, electricity, salary...) */

const EXPENSE_CATEGORIES = ["Rent", "Electricity", "Salary", "Transport", "Food", "Repairs", "Shop Maintenance", "Miscellaneous"];

App.pages.expenses = {
  title: "Expenses",

  render(el) {
    this.el = el;
    this.editId = null;
    const options = EXPENSE_CATEGORIES.map(c => `<option value="${c}">${c}</option>`).join("");

    el.innerHTML = `
      <div class="page-head"><h1>Expenses</h1></div>
      <div class="card">
        <h2 data-title>Add Expense</h2>
        <form data-form class="form-grid" novalidate>
          <label>Date<input type="date" name="date" required></label>
          <label>Category<select name="category">${options}</select></label>
          <label>Amount<input type="number" name="amount" min="0" step="any" inputmode="decimal" placeholder="e.g. 4000" required></label>
          <label class="span-all">Description<input type="text" name="description" placeholder="e.g. October electricity bill"></label>
          <p class="form-error span-all" role="alert" hidden></p>
          <div class="btn-row span-all">
            <button type="submit" class="btn btn-primary" data-submit>Save Expense</button>
            <button type="button" class="btn" data-cancel hidden>Cancel</button>
          </div>
        </form>
      </div>

      <div class="card">
        <h2>Expense History</h2>
        <div class="filters">
          <label>Search<input type="search" data-search placeholder="Description, amount, date..."></label>
          <label>Category<select data-category><option value="">All</option>${options}</select></label>
          <label>From<input type="date" data-from></label>
          <label>To<input type="date" data-to></label>
        </div>
        <div data-list></div>
      </div>`;

    this.form = $("[data-form]", el);
    this.resetForm();

    this.form.addEventListener("submit", e => { e.preventDefault(); this.save(); });
    $("[data-cancel]", el).addEventListener("click", () => this.resetForm());
    $$("[data-search],[data-category],[data-from],[data-to]", el).forEach(i => {
      i.addEventListener("input", () => this.drawList());
    });
    $("[data-list]", el).addEventListener("click", e => {
      const btn = e.target.closest("[data-act]");
      if (!btn) return;
      if (btn.dataset.act === "edit") this.startEdit(btn.dataset.id);
      if (btn.dataset.act === "delete") this.remove(btn.dataset.id);
    });

    this.drawList();
    if (App.takeAction("expenses") === "focus") this.form.elements.amount.focus();
  },

  resetForm() {
    this.editId = null;
    this.form.reset();
    this.form.elements.date.value = todayISO();
    $("[data-title]", this.el).textContent = "Add Expense";
    $("[data-submit]", this.el).textContent = "Save Expense";
    $("[data-cancel]", this.el).hidden = true;
    $(".form-error", this.form).hidden = true;
  },

  startEdit(id) {
    const r = Store.find("expenses", id);
    if (!r) return;
    this.editId = id;
    const f = this.form.elements;
    f.date.value = r.date;
    f.category.value = EXPENSE_CATEGORIES.includes(r.category) ? r.category : "Miscellaneous";
    f.amount.value = r.amount;
    f.description.value = r.description || "";
    $("[data-title]", this.el).textContent = "Edit Expense";
    $("[data-submit]", this.el).textContent = "Update Expense";
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

    const record = {
      date: f.date.value,
      category: f.category.value,
      amount: round2(amount),
      description: f.description.value.trim()
    };
    if (this.editId) Store.update("expenses", this.editId, record);
    else Store.add("expenses", record);
    UI.toast(this.editId ? "Expense updated successfully." : "Expense saved successfully.");
    this.resetForm();
    this.drawList();
  },

  async remove(id) {
    if (!(await UI.confirmDelete("Are you sure you want to delete this expense?"))) return;
    Store.remove("expenses", id);
    UI.toast("Expense deleted.");
    if (this.editId === id) this.resetForm();
    this.drawList();
  },

  drawList() {
    const q = $("[data-search]", this.el).value;
    const category = $("[data-category]", this.el).value;
    const from = $("[data-from]", this.el).value;
    const to = $("[data-to]", this.el).value;

    const rows = Store.list("expenses").filter(r =>
      inRange(r.date, from, to) && (!category || r.category === category) &&
      matches(q, [r.description, r.category, r.amount, fmtDate(r.date), r.date, "expense"])
    ).sort(byDateDesc);

    const list = $("[data-list]", this.el);
    if (!rows.length) {
      list.innerHTML = `<p class="empty">${Store.list("expenses").length ? "No match found." : "No expenses recorded yet."}</p>`;
      return;
    }
    const total = rows.reduce((sum, r) => sum + r.amount, 0);
    list.innerHTML = `<div class="table-wrap"><table>
      <thead><tr><th>Date</th><th>Category</th><th>Description</th><th class="num">Amount</th><th></th></tr></thead>
      <tbody>${rows.map(r => `<tr>
        <td>${fmtDate(r.date)}</td>
        <td><span class="badge badge-none">${esc(r.category)}</span></td>
        <td>${esc(r.description)}</td>
        <td class="num">${money(r.amount)}</td>
        <td class="actions">
          <button class="btn btn-small" data-act="edit" data-id="${r.id}">Edit</button>
          <button class="btn btn-small btn-danger-outline" data-act="delete" data-id="${r.id}">Delete</button>
        </td></tr>`).join("")}</tbody></table></div>
      <p class="list-total">${rows.length} record${rows.length === 1 ? "" : "s"} | Total: <strong>${money(total)}</strong></p>`;
  }
};
