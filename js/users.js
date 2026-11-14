/* users.js - "My Account" (change password) for everyone, and user management for the owner */

App.pages.account = {
  title: "Account & Users",

  render(el) {
    this.el = el;
    const me = Auth.user;
    const owner = Auth.isOwner();
    const users = Auth.users().slice().sort((a, b) => (a.role === b.role ? a.name.localeCompare(b.name) : a.role === "owner" ? -1 : 1));

    el.innerHTML = `
      <div class="page-head"><h1>${owner ? "Account &amp; Users" : "My Account"}</h1></div>
      <div class="card">
        <h2>My Account</h2>
        <p><strong>${esc(me.name)}</strong> <span class="badge ${owner ? "badge-in" : "badge-none"}">${owner ? "Owner" : "Staff"}</span></p>
        <p class="muted">Username: ${esc(me.username)}</p>
        <div class="btn-row">
          <button class="btn" data-act="password">Change My Password</button>
          <button class="btn" data-act="logout">Log Out</button>
        </div>
      </div>
      ${owner ? `<div class="card">
        <div class="page-head"><h2>Users</h2><button class="btn btn-primary" data-act="add">+ Add Staff User</button></div>
        <p class="muted">Staff can record income, customers, suppliers, expenses, loans and see reports. They cannot open
          Settings, Backup &amp; Restore or this page's user list.</p>
        <div class="table-wrap"><table>
          <thead><tr><th>Name</th><th>Username</th><th>Role</th><th></th></tr></thead>
          <tbody>${users.map(u => `<tr>
            <td>${esc(u.name)}</td><td>${esc(u.username)}</td>
            <td><span class="badge ${u.role === "owner" ? "badge-in" : "badge-none"}">${u.role === "owner" ? "Owner" : "Staff"}</span></td>
            <td class="actions">
              ${u.id !== me.id ? `<button class="btn btn-small" data-act="reset" data-id="${u.id}">Reset Password</button>` : ""}
              ${u.role !== "owner" ? `<button class="btn btn-small btn-danger-outline" data-act="delete" data-id="${u.id}">Delete</button>` : ""}
            </td></tr>`).join("")}</tbody></table></div>
      </div>
      <div class="card">
        <h2>Recovery Key</h2>
        <p class="muted">If you lost your recovery key, you can make a new one. The old key will stop working.</p>
        <button class="btn" data-act="newkey">Make New Recovery Key</button>
      </div>` : ""}`;

    el.addEventListener("click", e => {
      const btn = e.target.closest("[data-act]");
      if (!btn) return;
      const act = btn.dataset.act;
      if (act === "password") this.changeOwnPassword();
      if (act === "logout") Auth.logout();
      if (act === "add") this.addUser();
      if (act === "reset") this.resetPassword(btn.dataset.id);
      if (act === "delete") this.deleteUser(btn.dataset.id);
      if (act === "newkey") this.newKey();
    });
  },

  async changeOwnPassword() {
    const me = Auth.user;
    const v = await UI.form({
      title: "Change My Password",
      fields: [
        { name: "current", label: "Current Password", type: "password", required: true },
        { name: "password", label: "New Password", type: "password", required: true },
        { name: "password2", label: "Confirm New Password", type: "password", required: true }
      ],
      validate: v => !Auth.checkPassword(me, v.current) ? "The current password is not correct."
        : Auth.passwordProblem(v.password) || (v.password !== v.password2 ? "The two passwords are not the same." : "")
    });
    if (!v) return;
    Auth.setPassword(me, v.password);
    UI.toast("Password changed successfully.");
  },

  async addUser() {
    const v = await UI.form({
      title: "Add Staff User",
      fields: [
        { name: "name", label: "Full Name", required: true },
        { name: "username", label: "Username", required: true },
        { name: "password", label: "Password", type: "password", required: true },
        { name: "password2", label: "Confirm Password", type: "password", required: true }
      ],
      validate: v => Auth.usernameProblem(v.username) || Auth.passwordProblem(v.password) ||
        (v.password !== v.password2 ? "The two passwords are not the same." : "")
    });
    if (!v) return;
    Store.add("users", Object.assign({ name: v.name, username: v.username, role: "staff" }, Auth.passwordFields(v.password)));
    UI.toast("User saved successfully.");
    App.render();
  },

  async resetPassword(id) {
    const u = Store.find("users", id);
    const v = await UI.form({
      title: "Reset password for " + u.name,
      fields: [
        { name: "password", label: "New Password", type: "password", required: true },
        { name: "password2", label: "Confirm New Password", type: "password", required: true }
      ],
      validate: v => Auth.passwordProblem(v.password) || (v.password !== v.password2 ? "The two passwords are not the same." : "")
    });
    if (!v) return;
    Auth.setPassword(u, v.password);
    UI.toast("Password reset successfully.");
  },

  async deleteUser(id) {
    const u = Store.find("users", id);
    if (!(await UI.confirmDelete("Are you sure you want to delete the user " + u.name + "?"))) return;
    Store.remove("users", id);
    UI.toast("User deleted.");
    App.render();
  },

  async newKey() {
    if (!(await UI.confirm("Make a new recovery key? The old key will stop working.", { okText: "Make New Key" }))) return;
    const key = Auth.setRecoveryKey(Auth.user);
    Store.save();
    await UI.alert("Your new recovery key is:  " + key + "   Write it down and keep it safe. It will not be shown again.", "New Recovery Key");
  }
};
