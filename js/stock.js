/* stock.js - products, stock added, stock sold, and how much is left in the store.
   This is separate from the cash book: recording stock does not change any money. */

const STOCK_UNITS = ["pcs", "kg", "bag", "box", "packet", "dozen", "feet", "meter", "litre", "roll", "set", "pair", "ton"];

function fmtQty(n) {
  return (Math.round((Number(n) + Number.EPSILON) * 1000) / 1000).toLocaleString("en-US", { maximumFractionDigits: 3 });
}

const STOCK_STATUS = {
  ok: { label: "In Stock", cls: "badge-in" },
  low: { label: "Low Stock", cls: "badge-credit" },
  out: { label: "Out of Stock", cls: "badge-out" }
};

App.pages.stock = {
  title: "Stock",

  render(el) {
    this.el = el;
    this.editId = null;
    const units = STOCK_UNITS.map(u => `<option value="${u}">${u}</option>`).join("");

    el.innerHTML = `
      <div class="page-head no-print"><h1>Stock</h1>
        <div class="btn-row">
          <button class="btn btn-primary" data-print>Print Stock Report</button>
          <button class="btn" data-download>Stock Report (PDF)</button>
          <button class="btn" data-print-order>Print Order List</button>
          <button class="btn" data-download-order>Order List (PDF)</button>
        </div></div>

      <div class="cards no-print" data-cards></div>

      <div class="card no-print">
        <h2 data-title>Add Product</h2>
        <form data-form class="form-grid" novalidate>
          <label>Product Name<input type="text" name="name" placeholder="e.g. Cement (Bestway)" required></label>
          <label>Unit<select name="unit">${units}</select></label>
          <label>Stock in Store Now<input type="number" name="openingQty" min="0" step="any" inputmode="decimal" placeholder="e.g. 100"></label>
          <label>Order When Stock Falls To<input type="number" name="minLevel" min="0" step="any" inputmode="decimal" placeholder="e.g. 20 (optional)"></label>
          <label>Usual Order Quantity<input type="number" name="orderQty" min="0" step="any" inputmode="decimal" placeholder="e.g. 100 (optional)"></label>
          <label class="span-all">Notes<input type="text" name="notes" placeholder="Optional"></label>
          <p class="form-error span-all" role="alert" hidden></p>
          <div class="btn-row span-all">
            <button type="submit" class="btn btn-primary" data-submit>Save Product</button>
            <button type="button" class="btn" data-cancel hidden>Cancel</button>
          </div>
        </form>
        <p class="muted">When a product falls to its "Order When Stock Falls To" level (or finishes), it appears in the <strong>Items To Order</strong> list with its usual order quantity. "Stock in Store Now" is how much you already have today. After that, use <strong>Add Stock</strong> when new goods arrive and <strong>Sold</strong> when goods are sold.</p>
      </div>

      <div data-body></div>`;

    this.form = $("[data-form]", el);
    this.resetForm();
    this.form.addEventListener("submit", e => { e.preventDefault(); this.saveProduct(); });
    $("[data-cancel]", el).addEventListener("click", () => this.resetForm());
    $("[data-print]", el).addEventListener("click", () => this.printMode("stock"));
    $("[data-print-order]", el).addEventListener("click", () => this.printMode("order"));
    $("[data-download-order]", el).addEventListener("click", () => {
      Report.download(this.current.orderBlocks, "Order List", this.current.asOf, { from: todayISO(), to: todayISO() });
    });
    $("[data-download]", el).addEventListener("click", () => {
      Report.download(this.current.blocks, "Stock Report", this.current.asOf, { from: todayISO(), to: todayISO() });
    });

    el.addEventListener("click", e => {
      const btn = e.target.closest("[data-act]");
      if (!btn) return;
      const id = btn.dataset.id;
      const act = btn.dataset.act;
      if (act === "in" || act === "out") this.addMove(id, act);
      if (act === "edit") this.startEdit(id);
      if (act === "delete") this.removeProduct(id);
      if (act === "edit-move") this.editMove(id);
      if (act === "delete-move") this.removeMove(id);
    });

    this.draw();
    if (App.takeAction("stock") === "focus") this.form.elements.name.focus();
  },

  /* Prints either the stock report or the order list (the page holds both, one is hidden). */
  printMode(mode) {
    this.el.dataset.printMode = mode;
    setPrintFooter((mode === "order" ? "Order List: " : "Stock Report: ") + this.current.asOf);
    const back = () => {
      this.el.dataset.printMode = "stock";
      setPrintFooter("Stock Report: " + this.current.asOf);
      window.removeEventListener("afterprint", back);
    };
    window.addEventListener("afterprint", back);
    window.print();
  },

  /* ---------- product form ---------- */

  resetForm() {
    this.editId = null;
    this.form.reset();
    $("[data-title]", this.el).textContent = "Add Product";
    $("[data-submit]", this.el).textContent = "Save Product";
    $("[data-cancel]", this.el).hidden = true;
    $(".form-error", this.form).hidden = true;
  },

  startEdit(id) {
    const p = Store.find("products", id);
    if (!p) return;
    this.editId = id;
    const f = this.form.elements;
    f.name.value = p.name;
    if (!STOCK_UNITS.includes(p.unit)) f.unit.add(new Option(p.unit, p.unit));
    f.unit.value = p.unit;
    f.openingQty.value = p.openingQty;
    f.minLevel.value = p.minLevel || "";
    f.orderQty.value = p.orderQty || "";
    f.notes.value = p.notes || "";
    $("[data-title]", this.el).textContent = "Edit Product";
    $("[data-submit]", this.el).textContent = "Update Product";
    $("[data-cancel]", this.el).hidden = false;
    $(".form-error", this.form).hidden = true;
    this.form.scrollIntoView({ block: "center" });
    f.name.focus();
  },

  saveProduct() {
    const f = this.form.elements;
    const error = $(".form-error", this.form);
    const fail = m => { error.textContent = m; error.hidden = false; };
    const name = f.name.value.trim();
    const opening = f.openingQty.value.trim() === "" ? 0 : Number(f.openingQty.value);
    const min = f.minLevel.value.trim() === "" ? 0 : Number(f.minLevel.value);
    const orderQty = f.orderQty.value.trim() === "" ? 0 : Number(f.orderQty.value);
    if (!name) return fail("Please enter the product name.");
    if (isNaN(opening) || opening < 0) return fail("Stock in store cannot be less than zero.");
    if (isNaN(min) || min < 0) return fail("The order level cannot be less than zero.");
    if (isNaN(orderQty) || orderQty < 0) return fail("The order quantity cannot be less than zero.");
    const clash = Store.list("products").some(p => p.id !== this.editId && p.name.toLowerCase() === name.toLowerCase());
    if (clash) return fail("A product with this name already exists.");

    const record = { name, unit: f.unit.value, openingQty: opening, minLevel: min, orderQty, notes: f.notes.value.trim() };
    if (this.editId) {
      // The new opening amount must not make the remaining stock negative.
      const before = Store.find("products", this.editId);
      const probe = Object.assign({}, before, record);
      const saved = before.openingQty;
      before.openingQty = probe.openingQty;
      const st = Calc.stockOf(this.editId);
      before.openingQty = saved;
      if (st.remaining < 0) return fail("That would make the remaining stock less than zero, because more has been sold. Please check the number.");
      Store.update("products", this.editId, record);
    } else {
      Store.add("products", record);
    }
    UI.toast(this.editId ? "Product updated successfully." : "Product saved successfully.");
    this.resetForm();
    this.draw();
  },

  async removeProduct(id) {
    const p = Store.find("products", id);
    if (!p) return;
    if (Store.list("stockMoves").some(m => m.productId === id)) {
      await UI.alert(p.name + " has stock records. To keep the stock correct, please delete its stock entries first (in Stock History below), then delete the product.", "Cannot delete");
      return;
    }
    if (!(await UI.confirmDelete("Are you sure you want to delete " + p.name + "?"))) return;
    Store.remove("products", id);
    UI.toast("Product deleted.");
    if (this.editId === id) this.resetForm();
    this.draw();
  },

  /* ---------- stock in / sold ---------- */

  async addMove(productId, type, existing) {
    const p = Store.find("products", productId);
    if (!p) return;
    const stock = Calc.stockOf(productId);
    const room = type === "out" ? stock.remaining + (existing ? existing.qty : 0) : Infinity; // most that may be sold
    const label = type === "in" ? "Add Stock" : "Sold";
    const v = await UI.form({
      title: (existing ? "Edit " : "") + label + ": " + p.name,
      intro: "In store now: " + fmtQty(stock.remaining) + " " + p.unit + (type === "out" ? ". You can sell up to " + fmtQty(room) + " " + p.unit + "." : "."),
      values: existing ? { date: existing.date, qty: existing.qty, note: existing.note } : { date: todayISO() },
      fields: [
        { name: "date", label: "Date", type: "date", required: true },
        { name: "qty", label: (type === "in" ? "Quantity Received (" : "Quantity Sold (") + p.unit + ")", type: "number", required: true },
        { name: "note", label: "Note", placeholder: type === "in" ? "e.g. from Ali Traders" : "e.g. sold to Ahmed" }
      ],
      validate: values => (values.qty > room ? "Only " + fmtQty(room) + " " + p.unit + " is in store, so you cannot sell " + fmtQty(values.qty) + "." : "")
    });
    if (!v) return;
    const record = { productId, type, date: v.date, qty: round3(v.qty), note: v.note };
    if (existing) Store.update("stockMoves", existing.id, record);
    else Store.add("stockMoves", record);
    UI.toast(existing ? "Stock entry updated." : type === "in" ? "Stock added successfully." : "Sale recorded successfully.");
    this.draw();
  },

  async editMove(id) {
    const m = Store.find("stockMoves", id);
    if (!m) return;
    if (m.type === "in") {
      // Taking stock away must not leave a negative balance.
      const p = Store.find("products", m.productId);
      const st = Calc.stockOf(m.productId);
      const v = await UI.form({
        title: "Edit Add Stock: " + (p ? p.name : ""),
        values: { date: m.date, qty: m.qty, note: m.note },
        fields: [
          { name: "date", label: "Date", type: "date", required: true },
          { name: "qty", label: "Quantity Received (" + (p ? p.unit : "") + ")", type: "number", required: true },
          { name: "note", label: "Note" }
        ],
        validate: values => (st.remaining - m.qty + values.qty < 0 ? "That would make the remaining stock less than zero, because more has been sold." : "")
      });
      if (!v) return;
      Store.update("stockMoves", id, { date: v.date, qty: round3(v.qty), note: v.note });
      UI.toast("Stock entry updated.");
      this.draw();
    } else {
      await this.addMove(m.productId, "out", m);
    }
  },

  async removeMove(id) {
    const m = Store.find("stockMoves", id);
    if (!m) return;
    if (m.type === "in" && Calc.stockOf(m.productId).remaining - m.qty < 0) {
      await UI.alert("Deleting this entry would make the remaining stock less than zero, because more has already been sold. Delete or reduce the sales first.", "Cannot delete");
      return;
    }
    if (!(await UI.confirmDelete("Are you sure you want to delete this stock entry?"))) return;
    Store.remove("stockMoves", id);
    UI.toast("Stock entry deleted.");
    this.draw();
  },

  /* ---------- screen + print ---------- */

  rows() {
    return Store.list("products").slice().sort((a, b) => a.name.localeCompare(b.name)).map(p => {
      const s = Calc.stockOf(p.id);
      return { p, s };
    });
  },

  draw() {
    const el = this.el;
    const all = this.rows();
    const low = all.filter(r => r.s.status === "low").length;
    const out = all.filter(r => r.s.status === "out").length;
    const asOf = "As on " + fmtDate(todayISO());

    $("[data-cards]", el).innerHTML = `
      <div class="stat"><div class="stat-label">Products</div><div class="stat-value">${all.length}</div><div class="stat-note">Items in your stock list</div></div>
      <div class="stat amber"><div class="stat-label">Low Stock</div><div class="stat-value">${low}</div><div class="stat-note">Running short</div></div>
      <div class="stat red"><div class="stat-label">Out of Stock</div><div class="stat-value">${out}</div><div class="stat-note">Finished</div></div>`;

    // report blocks (shared by print and PDF)
    const blocks = [
      { t: "h", text: "Stock Summary" },
      { t: "rows", rows: [
        ["Total Products", String(all.length)],
        ["Low Stock", String(low)],
        ["Out of Stock", String(out)]] },
      { t: "h", text: "Stock List" },
      all.length ? { t: "table", cols: [
        { h: "#", w: 0.05, align: "c" }, { h: "Product", w: 0.29 }, { h: "Unit", w: 0.09 }, { h: "Opening", w: 0.12, align: "r" },
        { h: "Stock In", w: 0.12, align: "r" }, { h: "Sold", w: 0.12, align: "r" }, { h: "Remaining", w: 0.11, align: "r" },
        { h: "Status", w: 0.10 }],
        rows: all.map((r, i) => [String(i + 1), r.p.name, r.p.unit, fmtQty(r.s.opening), fmtQty(r.s.in), fmtQty(r.s.out),
          fmtQty(r.s.remaining), STOCK_STATUS[r.s.status].label]) }
        : { t: "note", text: "No products added yet." },
      { t: "sign" }
    ];
    const toOrder = all.filter(r => r.s.status !== "ok");
    const orderBlocks = [
      { t: "h", text: "Items To Order" },
      toOrder.length ? { t: "table", cols: [
        { h: "#", w: 0.06, align: "c" }, { h: "Product", w: 0.34 }, { h: "Unit", w: 0.10 }, { h: "In Store", w: 0.14, align: "r" },
        { h: "Order Level", w: 0.14, align: "r" }, { h: "Order Qty", w: 0.22, align: "r" }],
        rows: toOrder.map((r, i) => [String(i + 1), r.p.name, r.p.unit, fmtQty(r.s.remaining),
          r.p.minLevel ? fmtQty(r.p.minLevel) : "", r.p.orderQty ? fmtQty(r.p.orderQty) : ""]) }
        : { t: "note", text: "Nothing to order. All products are above their order level." },
      { t: "sign" }
    ];
    this.current = { blocks, orderBlocks, asOf };
    setPrintFooter((this.el.dataset.printMode === "order" ? "Order List: " : "Stock Report: ") + asOf);

    const tableRows = all.map(r => `<tr>
        <td><strong>${esc(r.p.name)}</strong>${r.p.notes ? `<div class="muted">${esc(r.p.notes)}</div>` : ""}</td>
        <td>${esc(r.p.unit)}</td>
        <td class="num">${fmtQty(r.s.opening)}</td>
        <td class="num">${fmtQty(r.s.in)}</td>
        <td class="num">${fmtQty(r.s.out)}</td>
        <td class="num"><strong>${fmtQty(r.s.remaining)}</strong></td>
        <td><span class="badge ${STOCK_STATUS[r.s.status].cls}">${STOCK_STATUS[r.s.status].label}</span></td>
        <td class="actions">
          <button class="btn btn-small btn-primary" data-act="in" data-id="${r.p.id}">+ Add Stock</button>
          <button class="btn btn-small" data-act="out" data-id="${r.p.id}">Sold</button>
          <button class="btn btn-small" data-act="edit" data-id="${r.p.id}">Edit</button>
          <button class="btn btn-small btn-danger-outline" data-act="delete" data-id="${r.p.id}">Delete</button>
        </td></tr>`).join("");

    const moves = this.moveFilterState();
    const orderRows = toOrder.map(r => `<tr>
        <td><strong>${esc(r.p.name)}</strong></td><td>${esc(r.p.unit)}</td>
        <td class="num">${fmtQty(r.s.remaining)}</td>
        <td class="num">${r.p.minLevel ? fmtQty(r.p.minLevel) : "&ndash;"}</td>
        <td class="num"><strong>${r.p.orderQty ? fmtQty(r.p.orderQty) + " " + esc(r.p.unit) : "&ndash;"}</strong></td>
        <td><span class="badge ${STOCK_STATUS[r.s.status].cls}">${STOCK_STATUS[r.s.status].label}</span></td>
        <td class="actions"><button class="btn btn-small btn-primary" data-act="in" data-id="${r.p.id}">+ Add Stock</button></td></tr>`).join("");

    $("[data-body]", el).innerHTML = `<div class="ps-stock">${printFrame(printHeader("Stock Report", asOf), Report.toHTML(blocks))}</div>
      <div class="ps-order">${printFrame(printHeader("Order List", asOf), Report.toHTML(orderBlocks))}</div><div class="screen-only">
      <div class="card">
        <h2>Items To Order <small class="muted">${toOrder.length} item${toOrder.length === 1 ? "" : "s"}</small></h2>
        ${toOrder.length ? `<div class="table-wrap"><table>
          <thead><tr><th>Product</th><th>Unit</th><th class="num">In Store</th><th class="num">Order Level</th><th class="num">Order Quantity</th><th>Status</th><th></th></tr></thead>
          <tbody>${orderRows}</tbody></table></div>
          <p class="muted">These products are finished or have fallen to their order level. Use "Print Order List" to take the list to the supplier.</p>`
        : `<p class="empty">Nothing to order right now.</p>`}
      </div>
      <div class="card">
        <h2>Stock List <small class="muted">${esc(asOf)}</small></h2>
        <div class="filters"><label>Search<input type="search" data-search placeholder="Product name..." value="${esc(moves.q)}"></label></div>
        ${all.length ? `<div class="table-wrap" data-stock-table><table>
          <thead><tr><th>Product</th><th>Unit</th><th class="num">Opening</th><th class="num">Stock In</th><th class="num">Sold</th>
            <th class="num">Remaining</th><th>Status</th><th></th></tr></thead>
          <tbody>${tableRows}</tbody></table></div>
          <p class="muted">Remaining = Opening + Stock In &minus; Sold.</p>`
        : `<p class="empty">No products yet. Add your first product above.</p>`}
      </div>
      <div class="card">
        <h2>Stock History</h2>
        <div class="filters">
          <label>Product<select data-mproduct><option value="">All</option>${Store.list("products").slice().sort((a, b) => a.name.localeCompare(b.name))
            .map(p => `<option value="${p.id}"${moves.product === p.id ? " selected" : ""}>${esc(p.name)}</option>`).join("")}</select></label>
          <label>Type<select data-mtype><option value="">All</option><option value="in"${moves.type === "in" ? " selected" : ""}>Stock Added</option>
            <option value="out"${moves.type === "out" ? " selected" : ""}>Sold</option></select></label>
          <label>From<input type="date" data-mfrom value="${esc(moves.from)}"></label>
          <label>To<input type="date" data-mto value="${esc(moves.to)}"></label>
        </div>
        <div data-moves></div>
      </div></div>`;

    const search = $("[data-search]", el);
    if (search) search.addEventListener("input", () => this.filterProducts());
    $$("[data-mproduct],[data-mtype],[data-mfrom],[data-mto]", el).forEach(i => i.addEventListener("input", () => this.drawMoves()));
    this.filterProducts();
    this.drawMoves();
  },

  /* Keeps what was typed in the filters when the page redraws after a save. */
  moveFilterState() {
    const v = sel => { const x = this.el && $(sel, this.el); return x ? x.value : ""; };
    return { q: v("[data-search]"), product: v("[data-mproduct]"), type: v("[data-mtype]"), from: v("[data-mfrom]"), to: v("[data-mto]") };
  },

  filterProducts() {
    const q = $("[data-search]", this.el);
    if (!q) return;
    $$("[data-stock-table] tbody tr", this.el).forEach(tr => {
      tr.hidden = !matches(q.value, [tr.cells[0].textContent, tr.cells[1].textContent]);
    });
  },

  drawMoves() {
    const el = this.el;
    const product = $("[data-mproduct]", el).value;
    const type = $("[data-mtype]", el).value;
    const from = $("[data-mfrom]", el).value;
    const to = $("[data-mto]", el).value;
    const rows = Store.list("stockMoves").filter(m =>
      (!product || m.productId === product) && (!type || m.type === type) && inRange(m.date, from, to)).sort(byDateDesc);
    const box = $("[data-moves]", el);
    if (!rows.length) {
      box.innerHTML = `<p class="empty">${Store.list("stockMoves").length ? "No match found." : "No stock entries yet. Use Add Stock or Sold on a product."}</p>`;
      return;
    }
    box.innerHTML = `<div class="table-wrap"><table>
      <thead><tr><th>Date</th><th>Product</th><th>Type</th><th class="num">Quantity</th><th>Note</th><th></th></tr></thead>
      <tbody>${rows.map(m => {
        const p = Store.find("products", m.productId);
        return `<tr><td>${fmtDate(m.date)}</td><td>${esc(p ? p.name : "(deleted)")}</td>
          <td><span class="badge ${m.type === "in" ? "badge-in" : "badge-out"}">${m.type === "in" ? "Stock Added" : "Sold"}</span></td>
          <td class="num">${m.type === "in" ? "+" : "&minus;"}${fmtQty(m.qty)} ${esc(p ? p.unit : "")}</td>
          <td>${esc(m.note || "")}</td>
          <td class="actions">
            <button class="btn btn-small" data-act="edit-move" data-id="${m.id}">Edit</button>
            <button class="btn btn-small btn-danger-outline" data-act="delete-move" data-id="${m.id}">Delete</button>
          </td></tr>`;
      }).join("")}</tbody></table></div>`;
  }
};
