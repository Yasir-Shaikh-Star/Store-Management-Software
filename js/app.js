/* app.js
   Shared helpers (money, dates, popups) and the page router.
   Each page file adds itself with:  App.pages.name = { title, render(element, argument) }  */

/* ---------- Small helpers ---------- */

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const $ = (selector, root) => (root || document).querySelector(selector);
const $$ = (selector, root) => Array.from((root || document).querySelectorAll(selector));
const pad = n => String(n).padStart(2, "0");

function esc(value) {
  return String(value == null ? "" : value).replace(/[&<>"']/g, c => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]
  ));
}

/* 125000 -> "Rs. 125,000" */
function money(n) {
  const currency = Store.data.settings.currency || "Rs.";
  const v = round2(n);
  return (v < 0 ? "-" : "") + currency + " " + Math.abs(v).toLocaleString("en-US", { maximumFractionDigits: 2 });
}

function toISO(dt) {
  return dt.getFullYear() + "-" + pad(dt.getMonth() + 1) + "-" + pad(dt.getDate());
}

function todayISO() {
  return toISO(new Date());
}

function parseISO(iso) {
  const p = iso.split("-").map(Number);
  return new Date(p[0], p[1] - 1, p[2]);
}

function addDays(iso, n) {
  const dt = parseISO(iso);
  dt.setDate(dt.getDate() + n);
  return toISO(dt);
}

/* "2026-10-04" -> "04 Oct 2026" */
function fmtDate(iso) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso || "")) return iso || "";
  const p = iso.split("-").map(Number);
  return pad(p[2]) + " " + MONTHS[p[1] - 1] + " " + p[0];
}

/* Date range for a period name. Weeks start on Monday. */
function periodRange(name) {
  const t = todayISO();
  if (name === "today") return { from: t, to: t };
  if (name === "yesterday") { const y = addDays(t, -1); return { from: y, to: y }; }
  if (name === "week") {
    const daysSinceMonday = (parseISO(t).getDay() + 6) % 7;
    return { from: addDays(t, -daysSinceMonday), to: t };
  }
  if (name === "month") return { from: t.slice(0, 8) + "01", to: t };
  return null;
}

function byDateDesc(a, b) {
  if (a.date !== b.date) return a.date < b.date ? 1 : -1;
  return (b.created || 0) - (a.created || 0);
}

/* True when every word typed in the search box is found in one of the fields. */
function matches(query, fields) {
  const words = String(query || "").toLowerCase().replace(/,/g, "").split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const text = fields.map(f => String(f == null ? "" : f)).join(" ").toLowerCase().replace(/,/g, "");
  return words.every(w => text.includes(w));
}

/* Shop letterhead + report title. Only visible when printing. */
function printHeader(title, period) {
  const h = Report.letterhead(title, period);
  return `<div class="print-only letterhead">
    <div class="lh-name">${esc(h.name)}</div>
    ${h.lines.map(l => `<div class="lh-info">${esc(l)}</div>`).join("")}
    <div class="lh-title">${esc(h.title)}</div>
    ${h.period ? `<div class="lh-period">${esc(h.period)}</div>` : ""}
    <div class="lh-meta">${esc(h.meta)}</div>
  </div>`;
}

/* A table whose header repeats on every printed page. Only visible when printing. */
function printFrame(headerHTML, bodyHTML) {
  return `<table class="print-only print-frame"><thead><tr><td>${headerHTML}</td></tr></thead>
    <tbody><tr><td>${bodyHTML}</td></tr></tbody></table>`;
}

/* Footer on every printed page: "Shop - label" on the left, "Page 1 of 3" on the right.
   Uses the browser's page margin boxes (Chrome and Edge version 131 or newer). */
function setPrintFooter(label) {
  let style = $("#print-page-style");
  if (!style) {
    style = document.createElement("style");
    style.id = "print-page-style";
    document.head.appendChild(style);
  }
  if (!label) { style.textContent = ""; return; }
  const text = (Store.data.settings.shopName + " - " + label).replace(/["\\\n\r]/g, " ");
  style.textContent = `@page { size: A4; margin: 14mm 14mm 20mm 14mm;
    @bottom-left { content: "${text}"; font: 8.5pt "Segoe UI", Arial, sans-serif; color: #444; }
    @bottom-right { content: "Page " counter(page) " of " counter(pages); font: 8.5pt "Segoe UI", Arial, sans-serif; color: #444; } }`;
}

function typeBadge(entry) {
  const cls = entry.cash > 0 ? "badge-in" : entry.cash < 0 ? "badge-out" : "badge-none";
  return `<span class="badge ${cls}">${esc(KINDS[entry.kind].label)}</span>`;
}

/* ---------- Popups, messages and shared form pieces ---------- */

const UI = {
  toast(message, type) {
    const box = $("#toasts");
    const t = document.createElement("div");
    t.className = "toast toast-" + (type || "success");
    t.textContent = message;
    box.appendChild(t);
    setTimeout(() => t.remove(), type === "error" ? 6000 : 3000);
  },

  dialog(html) {
    const dlg = document.createElement("dialog");
    dlg.className = "dialog";
    dlg.innerHTML = html;
    document.body.appendChild(dlg);
    dlg.addEventListener("close", () => dlg.remove());
    dlg.showModal();
    return dlg;
  },

  /* Yes/No question. Resolves true when the user presses the OK button. */
  confirm(message, options) {
    const o = Object.assign({ title: "Please confirm", okText: "OK", cancelText: "Cancel", danger: false, detail: "" }, options);
    return new Promise(resolve => {
      const dlg = UI.dialog(`<form method="dialog">
        <h3>${esc(o.title)}</h3>
        <p>${esc(message)}</p>
        ${o.detail ? `<p class="muted">${esc(o.detail)}</p>` : ""}
        <div class="dialog-actions">
          ${o.cancelText ? `<button value="cancel" class="btn">${esc(o.cancelText)}</button>` : ""}
          <button value="ok" class="btn ${o.danger ? "btn-danger" : "btn-primary"}">${esc(o.okText)}</button>
        </div></form>`);
      dlg.addEventListener("close", () => resolve(dlg.returnValue === "ok"));
    });
  },

  alert(message, title) {
    return UI.confirm(message, { title: title || "Notice", cancelText: null });
  },

  confirmDelete(message) {
    return UI.confirm(message, { title: "Delete", okText: "Delete", danger: true });
  },

  /* A few big buttons. Resolves with the chosen value, or null. */
  choose(title, options) {
    return new Promise(resolve => {
      const dlg = UI.dialog(`<form method="dialog">
        <h3>${esc(title)}</h3>
        <div class="choice-list">
          ${options.map(o => `<button value="${esc(o[1])}" class="btn btn-block">${esc(o[0])}</button>`).join("")}
        </div>
        <div class="dialog-actions"><button value="" class="btn">Cancel</button></div></form>`);
      dlg.addEventListener("close", () => resolve(dlg.returnValue || null));
    });
  },

  /* Popup form. fields: [{ name, label, type, required, options, placeholder }]
     Resolves with an object of values, or null if cancelled. */
  form(config) {
    const values = config.values || {};
    return new Promise(resolve => {
      let result = null;
      const dlg = UI.dialog(`<form novalidate>
        <h3>${esc(config.title)}</h3>
        ${config.intro ? `<p class="muted">${esc(config.intro)}</p>` : ""}
        <div class="form-stack">${config.fields.map(f => UI.fieldHTML(f, values)).join("")}</div>
        <p class="form-error" role="alert" hidden></p>
        <div class="dialog-actions">
          <button type="button" class="btn" data-cancel>Cancel</button>
          <button type="submit" class="btn btn-primary">${esc(config.submitText || "Save")}</button>
        </div></form>`);
      const form = $("form", dlg);
      const errorBox = $(".form-error", dlg);

      $("[data-cancel]", dlg).addEventListener("click", () => dlg.close());
      form.addEventListener("submit", e => {
        e.preventDefault();
        const out = {};
        for (const f of config.fields) {
          let raw = form.elements[f.name].value;
          if (f.type !== "textarea") raw = raw.trim();
          if (f.required && raw === "") return showError(f.label + " is required.");
          if (f.type === "number" && raw !== "") {
            const n = Number(raw);
            if (isNaN(n) || n <= 0) return showError(f.label + " must be more than zero.");
            out[f.name] = n;
          } else if (f.type === "date" && raw !== "" && !/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
            return showError("Please choose a valid date.");
          } else {
            out[f.name] = raw;
          }
        }
        if (config.validate) {
          const message = config.validate(out);
          if (message) return showError(message);
        }
        result = out;
        dlg.close();
      });
      function showError(message) {
        errorBox.textContent = message;
        errorBox.hidden = false;
        return false;
      }
      dlg.addEventListener("close", () => resolve(result));
    });
  },

  fieldHTML(f, values) {
    const v = values[f.name] == null ? "" : values[f.name];
    const req = f.required ? " required" : "";
    const star = f.required ? ' <span class="req">*</span>' : "";
    let input;
    if (f.type === "textarea") {
      input = `<textarea name="${f.name}" rows="3">${esc(v)}</textarea>`;
    } else if (f.type === "select") {
      input = `<select name="${f.name}"${req}>${f.options.map(o => {
        const value = Array.isArray(o) ? o[0] : o;
        const label = Array.isArray(o) ? o[1] : o;
        return `<option value="${esc(value)}"${String(value) === String(v) ? " selected" : ""}>${esc(label)}</option>`;
      }).join("")}</select>`;
    } else if (f.type === "number") {
      input = `<input type="number" name="${f.name}" min="0" step="any" inputmode="decimal" value="${esc(v)}"${req}>`;
    } else {
      input = `<input type="${f.type || "text"}" name="${f.name}" value="${esc(v)}" placeholder="${esc(f.placeholder || "")}"${req}>`;
    }
    return `<label>${esc(f.label)}${star}${input}</label>`;
  },

  /* Period dropdown (Today, This Week...) with custom From/To dates. */
  periodHTML(defaultName) {
    const names = [["today", "Today"], ["yesterday", "Yesterday"], ["week", "This Week"],
                   ["month", "This Month"], ["custom", "Custom Date Range"]];
    return `<div class="filters">
      <label>Period<select data-period>${names.map(n =>
        `<option value="${n[0]}"${n[0] === defaultName ? " selected" : ""}>${n[1]}</option>`).join("")}</select></label>
      <label data-custom>From<input type="date" data-from></label>
      <label data-custom>To<input type="date" data-to></label>
    </div>`;
  },

  /* Connects the period controls. Returns a function that gives { from, to }. */
  bindPeriod(root, onChange) {
    const select = $("[data-period]", root);
    const from = $("[data-from]", root);
    const to = $("[data-to]", root);
    const customBoxes = $$("[data-custom]", root);
    const sync = () => {
      const custom = select.value === "custom";
      customBoxes.forEach(box => { box.hidden = !custom; });
      if (!custom) {
        const r = periodRange(select.value);
        from.value = r.from;
        to.value = r.to;
      }
    };
    select.addEventListener("change", () => { sync(); onChange(); });
    from.addEventListener("input", onChange);
    to.addEventListener("input", onChange);
    sync();
    return () => {
      let f = from.value;
      let t = to.value;
      if (f && t && f > t) { const tmp = f; f = t; t = tmp; }
      return { from: f, to: t };
    };
  }
};

/* ---------- Pages and navigation ---------- */

const App = {
  pages: {},
  pending: null, // { page, action } - lets a button on one page open a form on another

  navItems: [
    ["dashboard", "Dashboard"], ["income", "Income / Sales"], ["customers", "Customers"],
    ["suppliers", "Suppliers"], ["expenses", "Expenses"], ["loans", "Loans"],
    ["stock", "Stock"], ["cashbook", "Cash Book"], ["reports", "Reports"], ["backup", "Backup & Restore"],
    ["settings", "Settings"], ["account", "Account & Users"]
  ],

  /* Pages that only the owner may open */
  ownerOnly: ["backup", "settings"],

  allowed(page) {
    return Auth.isOwner() || !App.ownerOnly.includes(page);
  },

  go(page, argument, action) {
    App.pending = action ? { page, action } : null;
    const hash = "#" + (argument ? page + "/" + argument : page);
    if (location.hash === hash) App.render();
    else location.hash = hash;
  },

  /* A page calls this when it opens, to see if it was asked to do something right away. */
  takeAction(page) {
    const p = App.pending;
    if (p && p.page === page) {
      App.pending = null;
      return p.action;
    }
    return null;
  },

  refreshBrand() {
    $("#brand-name").textContent = Store.data.settings.shopName || "Hardware Store";
    document.title = (Store.data.settings.shopName || "Hardware Store") + " - Cash Book";
  },

  render() {
    if (!Auth.user) return; // not logged in: the login screen is showing
    const parts = location.hash.replace(/^#\/?/, "").split("/");
    const key = App.pages[parts[0]] && App.allowed(parts[0]) ? parts[0] : "dashboard";
    const page = App.pages[key];

    $$("#nav a").forEach(a => a.classList.toggle("active", a.dataset.page === key));
    $("#topbar-title").textContent = page.title;
    App.closeMenu();

    // A fresh wrapper each time, so old event listeners disappear with the old page.
    const wrapper = document.createElement("div");
    wrapper.className = "page";
    setPrintFooter(""); // each page sets its own footer if it prints a report
    $("#content").replaceChildren(wrapper);
    try {
      page.render(wrapper, parts[1]);
    } catch (err) {
      console.error(err);
      wrapper.innerHTML = `<div class="card"><h2>Something went wrong</h2><p>${esc(err.message)}</p>
        <p><a href="#dashboard">Go to Dashboard</a></p></div>`;
    }
    window.scrollTo(0, 0);
  },

  openMenu() {
    $("#sidebar").classList.add("open");
    $("#backdrop").classList.add("show");
  },

  closeMenu() {
    $("#sidebar").classList.remove("open");
    $("#backdrop").classList.remove("show");
  },

  /* Called after a successful login (or setup). Shows the menu and the first page. */
  start() {
    Auth.hide();
    const owner = Auth.isOwner();
    $("#nav").innerHTML = App.navItems.filter(n => App.allowed(n[0])).map(n =>
      `<a href="#${n[0]}" data-page="${n[0]}">${esc(n[0] === "account" && !owner ? "My Account" : n[1])}</a>`).join("");
    $("#userbox").innerHTML = `<div class="user-name">${esc(Auth.user.name)} <small>(${owner ? "Owner" : "Staff"})</small></div>
      <button type="button" class="btn btn-small" id="logout-btn">Log Out</button>`;
    $("#logout-btn").addEventListener("click", () => Auth.logout());
    App.refreshBrand();
    App.updateBackupIndicator();
    App.render();
  },

  /* Small status line in the menu: is automatic backup working? */
  updateBackupIndicator() {
    const box = $("#backup-indicator");
    if (!box) return;
    const b = AutoBackup;
    const time = b.lastSaved ? " (saved " + b.lastSaved.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) + ")" : "";
    let html = "";
    if (!Auth.user || b.status === "unsupported") html = "";
    else if (b.status === "on") html = `<span class="bk-ok">&#10003; Auto-backup ON${esc(time)}</span>`;
    else if (b.status === "needs-permission") html = `<span class="bk-warn">Auto-backup paused</span> <button type="button" class="btn btn-small" data-resume-backup>Resume</button>`;
    else if (b.status === "error") html = `<span class="bk-warn">Auto-backup problem</span> <a href="#backup">Details</a>`;
    else html = Auth.isOwner() ? `<span class="bk-warn">Auto-backup OFF</span> <a href="#backup">Turn on</a>` : `<span class="bk-warn">Auto-backup OFF</span>`;
    box.innerHTML = html;
    const resume = $("[data-resume-backup]", box);
    if (resume) resume.addEventListener("click", async () => { await AutoBackup.resume(); });
  },

  async init() {
    Store.load();
    $("#menu-btn").addEventListener("click", App.openMenu);
    $("#backdrop").addEventListener("click", App.closeMenu);
    window.addEventListener("hashchange", App.render);

    if (!Store.storageWorks) {
      $("#banner").innerHTML = `<div class="alert alert-error">Your browser is blocking storage, so your records
        cannot be saved. Open this file in Chrome or Edge, and not in a private window.</div>`;
    }
    // Ask the browser to keep our data when it is short on space (works offline, no network).
    try {
      if (navigator.storage && navigator.storage.persist) navigator.storage.persist();
    } catch (e) { /* not important */ }

    App.refreshBrand();
    AutoBackup.onChange = changed => { App.updateBackupIndicator(); if (changed) App.backupStatusChanged(); };
    await AutoBackup.init();

    // Browser storage is empty but the mirror copy has the records: bring them back automatically.
    if (!Store.hadSavedData) {
      const mirror = await AutoBackup.readMirror();
      const clean = mirror && Store.normalize(mirror);
      if (clean && clean.users.length) {
        Store.replaceAll(mirror);
        App.refreshBrand();
        UI.toast("Your records were recovered automatically.");
      }
    }
    Auth.start();
  },

  /* The Backup page and Dashboard redraw themselves when the backup status changes. */
  backupStatusChanged() {
    const hash = location.hash.replace(/^#\/?/, "").split("/")[0];
    if (Auth.user && (hash === "backup" || hash === "dashboard" || hash === "") && !document.querySelector("dialog[open]")) App.render();
  }
};
