/* autobackup.js - saves your records automatically, so nobody has to remember to make backups.

   Two safety copies are kept besides the normal browser storage:
   1. A mirror copy inside the browser (IndexedDB). If the main browser storage is ever empty or damaged,
      the records are recovered from this copy automatically.
   2. A backup FILE in a folder chosen by the owner (Chrome or Edge). It is written again, by itself, about one
      second after every change. A dated copy is also kept for the last 14 days.
      This file is outside the browser, so it survives even if the browser data is cleared.

   Nothing here uses the internet. */

const AutoBackup = {
  supported: typeof window.showDirectoryPicker === "function" && typeof indexedDB !== "undefined",
  handle: null,        // the chosen folder
  status: "off",       // "off" | "on" | "needs-permission" | "error" | "unsupported"
  message: "",
  lastSaved: null,
  onChange: null,      // called whenever the status changes
  timer: null,
  writing: false,
  again: false,
  FILE: "hardware-store-backup.json",
  KEEP_DAYS: 14,

  /* ---- tiny key/value store in IndexedDB ---- */

  openDb() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open("hardwareStoreMeta", 1);
      req.onupgradeneeded = () => req.result.createObjectStore("kv");
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  },

  async kv(mode, action) {
    let db = null;
    try {
      db = await this.openDb();
      return await new Promise((resolve, reject) => {
        const store = db.transaction("kv", mode).objectStore("kv");
        const req = action(store);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
    } catch (e) {
      return null;
    } finally {
      if (db) db.close();
    }
  },
  kvGet(key) { return this.kv("readonly", s => s.get(key)); },
  kvSet(key, value) { return this.kv("readwrite", s => s.put(value, key)); },
  kvDelete(key) { return this.kv("readwrite", s => s.delete(key)); },

  /* ---- status ---- */

  set(status, message) {
    const changed = status !== this.status || (message || "") !== this.message;
    this.status = status;
    this.message = message || "";
    if (this.onChange) this.onChange(changed);
  },

  folderName() {
    return this.handle ? this.handle.name : "";
  },

  /* Called once when the software starts. */
  async init() {
    if (!this.supported) { this.set("unsupported"); return; }
    this.handle = await this.kvGet("backupFolder");
    if (!this.handle) { this.set("off"); return; }
    try {
      const permission = await this.handle.queryPermission({ mode: "readwrite" });
      this.set(permission === "granted" ? "on" : "needs-permission");
    } catch (e) {
      this.set("error", e.message);
    }
  },

  /* ---- owner actions (these must be started by a click) ---- */

  async choose() {
    let folder;
    try {
      folder = await window.showDirectoryPicker({ id: "hardwareStoreBackup", mode: "readwrite" });
    } catch (e) {
      return false; // the owner closed the folder window
    }
    this.handle = folder;
    await this.kvSet("backupFolder", folder);
    this.set("on");
    await this.writeNow();
    return this.status === "on";
  },

  /* The browser asks for permission again after it was closed. A click (such as logging in) allows it. */
  async resume() {
    if (!this.handle || this.status === "on") return;
    try {
      const permission = await this.handle.requestPermission({ mode: "readwrite" });
      if (permission === "granted") {
        this.set("on");
        await this.writeNow();
      }
    } catch (e) { /* the owner can try again later */ }
  },

  async turnOff() {
    this.handle = null;
    await this.kvDelete("backupFolder");
    this.set("off");
  },

  /* ---- saving ---- */

  /* Store.save() calls this after every change. The writing happens about one second later,
     so many quick changes become one write. */
  schedule() {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.flush(), 1000);
  },

  async flush() {
    this.timer = null;
    await this.kvSet("dataMirror", JSON.stringify(Store.data));
    if (this.status === "on") await this.writeNow();
  },

  async writeFile(name, text) {
    const file = await this.handle.getFileHandle(name, { create: true });
    const writer = await file.createWritable(); // the old file stays safe until close() succeeds
    await writer.write(text);
    await writer.close();
  },

  async writeNow() {
    if (!this.handle) return;
    if (this.writing) { this.again = true; return; }
    this.writing = true;
    try {
      const json = JSON.stringify(Store.data, null, 2);
      await this.writeFile(this.FILE, json);
      await this.writeFile("hardware-store-backup-" + todayISO() + ".json", json);
      await this.prune();
      this.lastSaved = new Date();
      this.set("on");
    } catch (e) {
      if (e && e.name === "NotAllowedError") this.set("needs-permission");
      else if (e && e.name === "NotFoundError") this.set("error", "The backup folder was not found. Please choose it again.");
      else this.set("error", (e && e.message) || "The backup file could not be written.");
    }
    this.writing = false;
    if (this.again) { this.again = false; this.schedule(); }
  },

  /* Keeps only the newest daily copies. */
  async prune() {
    const names = [];
    for await (const entry of this.handle.entries()) {
      if (/^hardware-store-backup-\d{4}-\d{2}-\d{2}\.json$/.test(entry[0])) names.push(entry[0]);
    }
    names.sort();
    while (names.length > this.KEEP_DAYS) await this.handle.removeEntry(names.shift());
  },

  /* ---- recovery from the browser mirror ---- */

  async readMirror() {
    const text = await this.kvGet("dataMirror");
    if (!text) return null;
    try { return JSON.parse(text); } catch (e) { return null; }
  }
};

// Save immediately when the window is closed or hidden, instead of waiting one second.
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden" && AutoBackup.timer) {
    clearTimeout(AutoBackup.timer);
    AutoBackup.flush();
  }
});
window.addEventListener("pagehide", () => {
  if (AutoBackup.timer) {
    clearTimeout(AutoBackup.timer);
    AutoBackup.flush();
  }
});
