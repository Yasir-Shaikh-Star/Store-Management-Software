/* settings.js - shop details, currency and opening cash */

App.pages.settings = {
  title: "Settings",

  render(el) {
    const s = Store.data.settings;
    el.innerHTML = `
      <div class="page-head"><h1>Settings</h1></div>
      <div class="card">
        <form data-form class="form-grid" novalidate>
          <label>Shop Name<input type="text" name="shopName" value="${esc(s.shopName)}"></label>
          <label>Owner Name<input type="text" name="ownerName" value="${esc(s.ownerName)}"></label>
          <label>Phone<input type="tel" name="phone" value="${esc(s.phone)}"></label>
          <label>Address<input type="text" name="address" value="${esc(s.address)}"></label>
          <label>Currency
            <input type="text" name="currency" value="${esc(s.currency)}" maxlength="8">
            <small class="muted">PKR (Rs.) - this is shown before every amount.</small></label>
          <label>Opening Cash Balance
            <input type="number" name="openingBalance" step="any" inputmode="decimal" value="${esc(s.openingBalance)}">
            <small class="muted">Cash in hand when you started using this software.</small></label>
          <p class="form-error span-all" role="alert" hidden></p>
          <div class="btn-row span-all"><button type="submit" class="btn btn-primary">Save Settings</button></div>
        </form>
      </div>`;

    const form = $("[data-form]", el);
    form.addEventListener("submit", e => {
      e.preventDefault();
      const f = form.elements;
      const opening = f.openingBalance.value.trim() === "" ? 0 : Number(f.openingBalance.value);
      if (isNaN(opening)) {
        const error = $(".form-error", form);
        error.textContent = "Opening Cash Balance must be a number.";
        error.hidden = false;
        return;
      }
      Object.assign(Store.data.settings, {
        shopName: f.shopName.value.trim() || "Hardware Store",
        ownerName: f.ownerName.value.trim(),
        phone: f.phone.value.trim(),
        address: f.address.value.trim(),
        currency: f.currency.value.trim() || "Rs.",
        openingBalance: round2(opening)
      });
      Store.save();
      App.refreshBrand();
      UI.toast("Settings saved successfully.");
    });
  }
};
