/* auth.js - first-time owner setup, login, logout and passwords.

   Users are saved inside the same data as everything else (Store.data.users), so they are
   included in backups. Passwords are never saved - only a salted, repeatedly hashed copy.

   Please note: this login keeps casual users out of the software. It cannot stop a person who
   can open the browser's developer tools on this computer. Keep the computer itself safe too. */

/* ---------- SHA-256 (works everywhere, even on file:// pages without a secure context) ---------- */

const sha256 = (function () {
  // Constants come from the first 64 prime numbers (this is how SHA-256 is defined).
  const K = [];
  const H0 = [];
  let candidate = 2;
  while (K.length < 64) {
    let isPrime = true;
    for (let i = 2; i * i <= candidate; i++) {
      if (candidate % i === 0) { isPrime = false; break; }
    }
    if (isPrime) {
      if (H0.length < 8) H0.push(Math.floor((Math.sqrt(candidate) % 1) * 4294967296) >>> 0);
      K.push(Math.floor((Math.cbrt(candidate) % 1) * 4294967296) >>> 0);
    }
    candidate++;
  }
  const rotr = (x, n) => (x >>> n) | (x << (32 - n));
  const w = new Uint32Array(64);

  /* bytes (Uint8Array) -> 32 byte Uint8Array */
  return function (bytes) {
    const len = bytes.length;
    const total = ((len + 9 + 63) >> 6) << 6;
    const buf = new Uint8Array(total);
    buf.set(bytes);
    buf[len] = 0x80;
    const view = new DataView(buf.buffer);
    view.setUint32(total - 8, Math.floor((len * 8) / 4294967296));
    view.setUint32(total - 4, (len * 8) >>> 0);

    const H = H0.slice();
    for (let off = 0; off < total; off += 64) {
      for (let i = 0; i < 16; i++) w[i] = view.getUint32(off + i * 4);
      for (let i = 16; i < 64; i++) {
        const s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3);
        const s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10);
        w[i] = (w[i - 16] + s0 + w[i - 7] + s1) | 0;
      }
      let a = H[0], b = H[1], c = H[2], d = H[3], e = H[4], f = H[5], g = H[6], h = H[7];
      for (let i = 0; i < 64; i++) {
        const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
        const ch = (e & f) ^ (~e & g);
        const t1 = (h + S1 + ch + K[i] + w[i]) | 0;
        const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
        const maj = (a & b) ^ (a & c) ^ (b & c);
        const t2 = (S0 + maj) | 0;
        h = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0;
      }
      H[0] = (H[0] + a) | 0; H[1] = (H[1] + b) | 0; H[2] = (H[2] + c) | 0; H[3] = (H[3] + d) | 0;
      H[4] = (H[4] + e) | 0; H[5] = (H[5] + f) | 0; H[6] = (H[6] + g) | 0; H[7] = (H[7] + h) | 0;
    }
    const out = new Uint8Array(32);
    const outView = new DataView(out.buffer);
    for (let i = 0; i < 8; i++) outView.setUint32(i * 4, H[i] >>> 0);
    return out;
  };
})();

/* ---------- Login logic ---------- */

const SESSION_KEY = "hardwareStoreSession";
const MAX_FAILED_LOGINS = 5;
const LOCK_SECONDS = 30;

const Auth = {
  user: null,
  failedLogins: 0,
  lockedUntil: 0,

  users() { return Store.list("users"); },
  hasUsers() { return this.users().length > 0; },
  isOwner() { return !!this.user && this.user.role === "owner"; },

  findByUsername(username) {
    const u = String(username || "").trim().toLowerCase();
    return this.users().find(x => x.username.toLowerCase() === u);
  },

  randomHex(bytes) {
    const arr = new Uint8Array(bytes);
    if (window.crypto && crypto.getRandomValues) crypto.getRandomValues(arr);
    else for (let i = 0; i < bytes; i++) arr[i] = Math.floor(Math.random() * 256);
    return Array.from(arr, b => b.toString(16).padStart(2, "0")).join("");
  },

  /* Salted hash, repeated many times to make guessing slow. */
  hash(secret, salt) {
    const enc = new TextEncoder();
    let h = sha256(enc.encode(salt + ":" + secret));
    for (let i = 0; i < 5000; i++) {
      const next = new Uint8Array(h.length + salt.length);
      next.set(h);
      next.set(enc.encode(salt), h.length);
      h = sha256(next);
    }
    return Array.from(h, b => b.toString(16).padStart(2, "0")).join("");
  },

  passwordFields(password) {
    const salt = this.randomHex(16);
    return { salt, hash: this.hash(password, salt) };
  },

  checkPassword(user, password) {
    return this.hash(password, user.salt) === user.hash;
  },

  passwordProblem(password) {
    return password.length < 6 ? "Password must be at least 6 characters." : "";
  },

  usernameProblem(username, ignoreId) {
    if (!/^[A-Za-z0-9._-]{3,30}$/.test(username)) {
      return "Username must be 3 to 30 letters or numbers (no spaces).";
    }
    const other = this.findByUsername(username);
    if (other && other.id !== ignoreId) return "This username is already used.";
    return "";
  },

  /* Easy-to-write key, e.g. K7QM-4TXD-9HWA-2PNE (no confusing letters like 0/O or 1/I) */
  newRecoveryKey() {
    const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
    const arr = new Uint8Array(16);
    if (window.crypto && crypto.getRandomValues) crypto.getRandomValues(arr);
    else for (let i = 0; i < 16; i++) arr[i] = Math.floor(Math.random() * 256);
    const chars = Array.from(arr, b => alphabet[b % alphabet.length]).join("");
    return chars.match(/.{4}/g).join("-");
  },

  cleanKey(key) {
    return String(key || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  },

  setRecoveryKey(user) {
    const key = this.newRecoveryKey();
    user.recoverySalt = this.randomHex(16);
    user.recoveryHash = this.hash(this.cleanKey(key), user.recoverySalt);
    return key;
  },

  /* Creates the owner at first start. Returns the recovery key. */
  createOwner(v) {
    const user = Store.add("users", Object.assign(
      { name: v.name, username: v.username, role: "owner" }, this.passwordFields(v.password)));
    const key = this.setRecoveryKey(user);
    Store.data.settings.shopName = v.shopName || Store.data.settings.shopName;
    Store.data.settings.ownerName = v.name;
    Store.save();
    this.user = user;
    this.rememberSession();
    return key;
  },

  /* Returns "" when logged in, otherwise a message to show. */
  login(username, password) {
    const wait = Math.ceil((this.lockedUntil - Date.now()) / 1000);
    if (wait > 0) return "Too many wrong attempts. Please wait " + wait + " seconds.";
    const user = this.findByUsername(username);
    if (user && this.checkPassword(user, password)) {
      this.failedLogins = 0;
      this.user = user;
      this.rememberSession();
      return "";
    }
    this.failedLogins++;
    if (this.failedLogins >= MAX_FAILED_LOGINS) {
      this.failedLogins = 0;
      this.lockedUntil = Date.now() + LOCK_SECONDS * 1000;
      return "Too many wrong attempts. Please wait " + LOCK_SECONDS + " seconds.";
    }
    return "Wrong username or password.";
  },

  rememberSession() {
    try { sessionStorage.setItem(SESSION_KEY, this.user.id); } catch (e) { /* not important */ }
  },

  /* Stay logged in when the page is refreshed (until the browser tab is closed). */
  restoreSession() {
    let id = null;
    try { id = sessionStorage.getItem(SESSION_KEY); } catch (e) { /* ignore */ }
    this.user = id ? Store.find("users", id) || null : null;
    return !!this.user;
  },

  logout() {
    this.user = null;
    try { sessionStorage.removeItem(SESSION_KEY); } catch (e) { /* ignore */ }
    history.replaceState(null, "", location.pathname);
    this.start();
  },

  setPassword(user, password) {
    Object.assign(user, this.passwordFields(password));
    Store.save();
  },

  /* ---------- Screens ---------- */

  start() {
    if (!this.hasUsers()) this.setupScreen();
    else if (this.restoreSession()) App.start();
    else this.loginScreen();
  },

  show(html) {
    const box = $("#auth");
    box.innerHTML = `<div class="auth-card">${html}</div>`;
    box.hidden = false;
    document.body.classList.add("locked");
    const first = $("input", box);
    if (first) first.focus();
    return box;
  },

  hide() {
    $("#auth").hidden = true;
    $("#auth").innerHTML = "";
    document.body.classList.remove("locked");
  },

  setupScreen() {
    const box = this.show(`
      <h1>Welcome</h1>
      <p class="muted">First-time setup. Create the <strong>Owner (admin)</strong> account.
        You will use it to log in every time.</p>
      <form novalidate>
        <div class="form-stack">
          ${[
            { name: "shopName", label: "Shop Name", required: true },
            { name: "name", label: "Owner Name", required: true },
            { name: "username", label: "Username", required: true },
            { name: "password", label: "Password", type: "password", required: true },
            { name: "password2", label: "Confirm Password", type: "password", required: true }
          ].map(f => UI.fieldHTML(f, { shopName: Store.data.settings.shopName === "Hardware Store" ? "" : Store.data.settings.shopName })).join("")}
        </div>
        <p class="form-error" role="alert" hidden></p>
        <button type="submit" class="btn btn-primary auth-btn">Create Owner Account</button>
      </form>
      <p class="auth-link">Moving from another computer? <a href="#" data-restore>Restore a backup</a></p>
      <input type="file" accept=".json,application/json" data-file hidden>`);

    const form = $("form", box);
    const error = $(".form-error", box);
    form.addEventListener("submit", e => {
      e.preventDefault();
      const f = form.elements;
      const v = { shopName: f.shopName.value.trim(), name: f.name.value.trim(),
                  username: f.username.value.trim(), password: f.password.value };
      let problem = "";
      if (!v.shopName || !v.name) problem = "Please fill in the shop name and owner name.";
      else problem = this.usernameProblem(v.username) || this.passwordProblem(v.password);
      if (!problem && v.password !== f.password2.value) problem = "The two passwords are not the same.";
      if (problem) { error.textContent = problem; error.hidden = false; return; }
      this.recoveryKeyScreen(this.createOwner(v));
    });

    const input = $("[data-file]", box);
    $("[data-restore]", box).addEventListener("click", e => { e.preventDefault(); input.click(); });
    input.addEventListener("change", () => {
      if (input.files.length) this.restoreFromSetup(input.files[0]);
      input.value = "";
    });
  },

  restoreFromSetup(file) {
    const reader = new FileReader();
    reader.onload = async () => {
      let parsed = null;
      try { parsed = JSON.parse(reader.result); } catch (e) { /* handled below */ }
      if (!Store.normalize(parsed)) {
        await UI.alert("This file is not a valid backup of this software.", "Restore failed");
        return;
      }
      if (!(await UI.confirm("Restore all records from this backup?", { title: "Restore Backup", okText: "Restore" }))) return;
      Store.replaceAll(parsed);
      try { sessionStorage.removeItem(SESSION_KEY); } catch (e) { /* ignore */ }
      UI.toast("Backup restored successfully.");
      this.start(); // goes to login if the backup has users, otherwise continues setup
    };
    reader.readAsText(file);
  },

  recoveryKeyScreen(key) {
    const box = this.show(`
      <h1>Save your recovery key</h1>
      <p>If you forget the owner password, this key is the <strong>only way</strong> to set a new one.
        Write it on paper and keep it in a safe place. It will not be shown again.</p>
      <div class="recovery-key">${esc(key)}</div>
      <button type="button" class="btn btn-primary auth-btn" data-continue>I have saved it - Continue</button>`);
    $("[data-continue]", box).addEventListener("click", () => App.start());
  },

  loginScreen() {
    const box = this.show(`
      <h1>${esc(Store.data.settings.shopName || "Hardware Store")}</h1>
      <p class="muted">Please log in.</p>
      <form novalidate>
        <div class="form-stack">
          ${UI.fieldHTML({ name: "username", label: "Username" }, {})}
          ${UI.fieldHTML({ name: "password", label: "Password", type: "password" }, {})}
        </div>
        <p class="form-error" role="alert" hidden></p>
        <button type="submit" class="btn btn-primary auth-btn">Log In</button>
      </form>
      <p class="auth-link"><a href="#" data-forgot>Forgot password?</a></p>`);
    const form = $("form", box);
    const error = $(".form-error", box);
    form.addEventListener("submit", e => {
      e.preventDefault();
      const message = this.login(form.elements.username.value, form.elements.password.value);
      if (message) {
        error.textContent = message;
        error.hidden = false;
        form.elements.password.value = "";
        form.elements.password.focus();
        return;
      }
      AutoBackup.resume(); // a click is needed to give the browser permission to write the backup file again
      App.start();
    });
    $("[data-forgot]", box).addEventListener("click", e => { e.preventDefault(); this.forgotScreen(); });
  },

  forgotScreen() {
    const box = this.show(`
      <h1>Forgot password</h1>
      <p class="muted">Enter the owner username, the recovery key you saved at setup, and a new password.
        Staff members should ask the owner to reset their password.</p>
      <form novalidate>
        <div class="form-stack">
          ${UI.fieldHTML({ name: "username", label: "Owner Username" }, {})}
          ${UI.fieldHTML({ name: "key", label: "Recovery Key", placeholder: "XXXX-XXXX-XXXX-XXXX" }, {})}
          ${UI.fieldHTML({ name: "password", label: "New Password", type: "password" }, {})}
          ${UI.fieldHTML({ name: "password2", label: "Confirm New Password", type: "password" }, {})}
        </div>
        <p class="form-error" role="alert" hidden></p>
        <button type="submit" class="btn btn-primary auth-btn">Set New Password</button>
      </form>
      <p class="auth-link"><a href="#" data-back>Back to login</a></p>`);
    const form = $("form", box);
    const error = $(".form-error", box);
    const fail = message => { error.textContent = message; error.hidden = false; };
    form.addEventListener("submit", e => {
      e.preventDefault();
      const f = form.elements;
      const wait = Math.ceil((this.lockedUntil - Date.now()) / 1000);
      if (wait > 0) return fail("Too many wrong attempts. Please wait " + wait + " seconds.");
      const user = this.findByUsername(f.username.value);
      const keyOk = user && user.role === "owner" && user.recoveryHash &&
        this.hash(this.cleanKey(f.key.value), user.recoverySalt) === user.recoveryHash;
      if (!keyOk) {
        this.failedLogins++;
        if (this.failedLogins >= MAX_FAILED_LOGINS) {
          this.failedLogins = 0;
          this.lockedUntil = Date.now() + LOCK_SECONDS * 1000;
        }
        return fail("The username or recovery key is not correct.");
      }
      const problem = this.passwordProblem(f.password.value);
      if (problem) return fail(problem);
      if (f.password.value !== f.password2.value) return fail("The two passwords are not the same.");
      this.setPassword(user, f.password.value);
      const newKey = this.setRecoveryKey(user); // a recovery key works only once
      Store.save();
      this.user = user;
      this.rememberSession();
      this.recoveryKeyScreen(newKey);
    });
    $("[data-back]", box).addEventListener("click", e => { e.preventDefault(); this.loginScreen(); });
  }
};
