/* customers.js - customers who buy on credit and pay later (see parties.js for the shared code) */

App.pages.customers = makePartyPage({
  kind: "customer",
  page: "customers",
  collection: "customers",
  title: "Customers",
  single: "Customer",
  chargeBtn: "Add Credit",
  payBtn: "Receive Payment",
  chargeWord: "Credit",
  totalLabel: "Total Credit",
  paidLabel: "Payments",
  emptyText: "No customers yet. Press \"Add Customer\" to add one."
});
