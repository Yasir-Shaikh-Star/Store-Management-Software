/* suppliers.js - suppliers the shop buys from and pays later (see parties.js for the shared code) */

App.pages.suppliers = makePartyPage({
  kind: "supplier",
  page: "suppliers",
  collection: "suppliers",
  title: "Suppliers",
  single: "Supplier",
  chargeBtn: "Add Bill (Amount Owed)",
  payBtn: "Make Payment",
  chargeWord: "Bill",
  totalLabel: "Amount Owed",
  paidLabel: "Paid",
  emptyText: "No suppliers yet. Press \"Add Supplier\" to add one."
});
