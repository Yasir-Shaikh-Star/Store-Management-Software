/* backup.js - save all data to a file, and bring it back from a file */

App.pages.backup = {
  title: "Backup & Restore",

  render(el) {
    const last = Store.data.settings.lastBackup;
    el.innerHTML = `
      <div class="page-head"><h1>Backup &amp; Restore</h1></div>
      ${this.autoCardHTML()}

      <div class="card">
        <h2>Download Backup (by hand)</h2>
        <p>Saves all your records in one file named <strong>hardware-store-backup.json</strong>.</p>
        <p class="muted">${last ? "Last backup: " + esc(new Date(last).toLocaleString()) : "You have not made a backup yet."}</p>
        <button class="btn btn-primary" data-download>Download Backup</button>
      </div>

      <div class="card">
        <h2>Restore Backup</h2>
        <p>Choose a backup file (.json) to bring your records back. This replaces the records currently in the software.</p>
        <input type="file" accept=".json,application/json" data-file hidden>
        <button class="btn" data-restore>Restore Backup</button>
      </div>`;

    this.bindAuto(el);
    $("[data-download]", el).addEventListener("click", () => { this.download(); this.render(el); });
    const input = $("[data-file]", el);
    $("[data-restore]", el).addEventListener("click", () => input.click());
    input.addEventListener("change", () => {
      if (input.files.length) this.restore(input.files[0]);
      input.value = "";
    });
  },

  /* The "Automatic Backup" box at the top of the page. */
  autoCardHTML() {
    const b = AutoBackup;
    let status;
    let buttons = "";
    if (b.status === "unsupported") {
      return `<div class="card"><h2>Automatic Backup</h2>
        <p>This browser cannot save backup files by itself. Please use <strong>Google Chrome or Microsoft Edge</strong>, or
        download a backup by hand below every week.</p></div>`;
    }
    if (b.status === "on") {
      status = `<span class="badge badge-in">ON</span> A copy of all your records is saved automatically in the folder
        <strong>${esc(b.folderName())}</strong> a moment after every change.` +
        (b.lastSaved ? ` Last saved at ${esc(b.lastSaved.toLocaleTimeString())}.` : "") +
        ` Daily copies of the last ${b.KEEP_DAYS} days are kept too.`;
      buttons = `<button class="btn btn-primary" data-auto="now">Back Up Now</button>
        <button class="btn" data-auto="choose">Change Folder</button>
        <button class="btn btn-danger-outline" data-auto="off">Turn Off</button>`;
    } else if (b.status === "needs-permission") {
      status = `<span class="badge badge-credit">PAUSED</span> The browser needs your permission again to write to the folder
        <strong>${esc(b.folderName())}</strong>. Press Resume and choose Allow.`;
      buttons = `<button class="btn btn-primary" data-auto="resume">Resume Automatic Backup</button>
        <button class="btn" data-auto="choose">Change Folder</button>
        <button class="btn btn-danger-outline" data-auto="off">Turn Off</button>`;
    } else {
      status = (b.status === "error"
        ? `<span class="badge badge-out">PROBLEM</span> ${esc(b.message)}`
        : `<span class="badge badge-out">OFF</span> Your records are only inside this browser.`) +
        ` Choose a folder and the software will save a backup file there by itself after every change.
        Make a NEW folder first (for example <strong>D:\\HardwareStoreBackup</strong>) and choose it. Chrome and Edge do not allow
        Desktop, Documents, Downloads or a whole drive. A folder on another drive, a USB drive, or inside OneDrive / Google Drive is best.`;
      buttons = `<button class="btn btn-primary" data-auto="choose">Choose Backup Folder</button>`;
    }
    return `<div class="card" data-auto-card><h2>Automatic Backup</h2><p>${status}</p><div class="btn-row">${buttons}</div>
      <p class="muted">The file is named <strong>${esc(AutoBackup.FILE)}</strong>. It contains your records and logins, so keep the folder private.
        To restore, use "Restore Backup" below and pick this file.</p></div>`;
  },

  bindAuto(el) {
    const card = $("[data-auto-card]", el);
    if (!card) return;
    card.addEventListener("click", async e => {
      const btn = e.target.closest("[data-auto]");
      if (!btn) return;
      const act = btn.dataset.auto;
      if (act === "choose") {
        if (await AutoBackup.choose()) UI.toast("Automatic backup is ON.");
      }
      if (act === "resume") await AutoBackup.resume();
      if (act === "now") {
        await AutoBackup.writeNow();
        if (AutoBackup.status === "on") UI.toast("Backup saved successfully.");
      }
      if (act === "off") {
        if (await UI.confirm("Turn off automatic backup? Your records will then exist only inside this browser.", { okText: "Turn Off", danger: true })) {
          await AutoBackup.turnOff();
        }
      }
    });
  },

  download() {
    Store.data.settings.lastBackup = new Date().toISOString();
    Store.save();
    const blob = new Blob([JSON.stringify(Store.data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "hardware-store-backup.json";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    UI.toast("Backup downloaded successfully.");
  },

  restore(file) {
    const reader = new FileReader();
    reader.onerror = () => UI.alert("The file could not be read.", "Restore failed");
    reader.onload = async () => {
      let parsed = null;
      try { parsed = JSON.parse(reader.result); } catch (e) { /* handled below */ }
      const clean = Store.normalize(parsed);
      if (!clean) {
        await UI.alert("This file is not a valid backup of this software. Your current data was not changed.", "Restore failed");
        return;
      }
      const detail = file.name + ": " + clean.customers.length + " customers, " + clean.suppliers.length + " suppliers, " +
        clean.income.length + " income, " + clean.expenses.length + " expenses, " + clean.loans.length + " loans.";
      const ok = await UI.confirm("Restoring this backup will replace your current data. Continue?",
        { title: "Restore Backup", okText: "Restore", detail });
      if (!ok) return;
      Store.replaceAll(parsed);
      // The backup may contain different users. If the person logged in is not in it, log in again.
      const stillThere = Store.find("users", Auth.user.id);
      if (!stillThere) {
        UI.toast("Backup restored successfully. Please log in again.");
        Auth.logout();
        return;
      }
      Auth.user = stillThere;
      App.refreshBrand();
      UI.toast("Backup restored successfully.");
      App.render();
    };
    reader.readAsText(file);
  }
};
