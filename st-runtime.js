// The public site's runtime, loaded first on every page (before the site's own scripts):
// - every fetch("/api/...") goes to the Python worker (st-worker.js) instead of a server;
// - the player's files come from their account (Discord login → Supabase) or, without login, from this browser,
//   and go back after every change;
// - the header gets the login button, and a panel shows what is loading or being computed.
// Pages use window.STAccount (account page) and the "st-account" event (fired when the files are loaded).
(function () {
  "use strict";
  const CFG = window.ST_CONFIG || {};
  const SUPABASE_JS = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.js";
  const LOCAL_ID = "local";
  const MUTATING = [/^\/api\/bucket\/(edit|resolve|regenerate)$/, /^\/api\/review\/(run|rerolls\/run)$/];

  // ------------------------------------------------------------ worker
  const worker = new Worker("/st-worker.js");
  let seq = 0;
  const waiting = new Map();
  const listeners = new Set();
  worker.onmessage = (e) => {
    const m = e.data;
    if (m.report) { listeners.forEach((fn) => fn(m.report)); return; }
    const w = waiting.get(m.id);
    if (!w) return;
    waiting.delete(m.id);
    m.ok ? w.resolve(m.result) : w.reject(new Error(m.error));
  };
  function call(op, ...args) {
    return new Promise((resolve, reject) => {
      const id = ++seq;
      waiting.set(id, { resolve, reject });
      worker.postMessage({ id, op, args });
    });
  }

  // ------------------------------------------------------------ storage
  const idb = (() => {
    let db;
    const open = () => db || (db = new Promise((res, rej) => {
      const r = indexedDB.open("shoptitans", 1);
      r.onupgradeneeded = () => r.result.createObjectStore("kv");
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    }));
    const tx = async (mode, fn) => {
      const d = await open();
      return new Promise((res, rej) => {
        const t = d.transaction("kv", mode);
        const req = fn(t.objectStore("kv"));
        t.oncomplete = () => res(req && req.result);
        t.onerror = () => rej(t.error);
      });
    };
    return {
      get: (k) => tx("readonly", (s) => s.get(k)).catch(() => undefined),
      set: (k, v) => tx("readwrite", (s) => s.put(v, k)).catch(() => undefined),
      del: (k) => tx("readwrite", (s) => s.delete(k)).catch(() => undefined),
    };
  })();

  let sb = null; // Supabase client, when configured
  let user = null; // {id, name, avatar, mode: "discord" | "local"}

  function loadScript(src) {
    return new Promise((res, rej) => {
      const s = document.createElement("script");
      s.src = src;
      s.onload = res;
      s.onerror = () => rej(new Error("δεν φόρτωσε " + src));
      document.head.appendChild(s);
    });
  }

  async function supabaseClient() {
    if (sb || !CFG.supabaseUrl || !CFG.supabaseKey) return sb;
    await loadScript(SUPABASE_JS);
    sb = window.supabase.createClient(CFG.supabaseUrl, CFG.supabaseKey);
    return sb;
  }

  function who(session) {
    const u = session.user, md = u.user_metadata || {};
    return { id: u.id, mode: "discord", avatar: md.avatar_url || null,
             name: (md.custom_claims && md.custom_claims.global_name) || md.full_name || md.name || md.user_name || "Discord" };
  }

  const remote = {
    async read() {
      if (user.mode === "local") return (await idb.get("user:" + LOCAL_ID)) || {};
      const { data, error } = await sb.from("accounts").select("files, updated_at").eq("user_id", user.id).maybeSingle();
      if (error) throw error;
      return (data && data.files) || {};
    },
    async write(files) {
      if (user.mode === "local") return idb.set("user:" + LOCAL_ID, files);
      const { error } = await sb.from("accounts").upsert({ user_id: user.id, files, updated_at: new Date().toISOString() });
      if (error) throw error;
    },
  };

  // ------------------------------------------------------------ account state
  let markReady;
  const ready = new Promise((res) => { markReady = res; });
  let saving = Promise.resolve();
  let saveTimer = null;
  const state = { phase: "start", saved: true, error: null };

  async function saveDerived() {
    if (user) await idb.set("derived:" + user.id, await call("derivedFiles"));
  }

  function save(now) {
    state.saved = false;
    paintChip();
    clearTimeout(saveTimer);
    const run = () => {
      saving = saving.then(async () => {
        try {
          await remote.write(await call("userFiles"));
          state.saved = true;
          state.error = null;
        } catch (err) {
          state.error = "δεν αποθηκεύτηκε: " + err.message;
        }
        paintChip();
      });
      return saving;
    };
    if (now) return run();
    saveTimer = setTimeout(run, 800);
    return Promise.resolve();
  }

  async function start(u) {
    user = u;
    state.phase = "loading";
    paintPanel();
    try {
      const [files, derived] = [await remote.read(), await idb.get("derived:" + u.id)];
      await call("load", files, derived || null);
      state.phase = "ready";
    } catch (err) {
      state.phase = "error";
      state.error = err.message;
    }
    paintPanel();
    paintChip();
    markReady();
    window.dispatchEvent(new CustomEvent("st-account", { detail: { user } }));
  }

  async function boot() {
    call("boot").catch(() => {}); // start downloading Python at once, while the login is checked
    let client = null;
    try { client = await supabaseClient(); } catch (err) { state.error = err.message; }
    if (client) {
      const { data } = await client.auth.getSession();
      if (data.session) return start(who(data.session));
    }
    if (localStorage.getItem("st-local") === "1" || !client) return start({ id: LOCAL_ID, mode: "local", name: "αυτός ο browser" });
    state.phase = "login";
    paintPanel();
  }

  // ------------------------------------------------------------ fetch → worker
  const realFetch = window.fetch.bind(window);
  window.fetch = async function (input, opts) {
    const url = new URL(typeof input === "string" ? input : input.url, location.href);
    if (url.origin !== location.origin || !url.pathname.startsWith("/api/")) return realFetch(input, opts);
    await ready;
    const method = ((opts && opts.method) || (input.method) || "GET").toUpperCase();
    let body = opts && opts.body;
    if (body && typeof body !== "string") body = await new Response(body).text();
    const r = await call("api", method, url.pathname + url.search, body || null);
    if (method === "POST" && MUTATING.some((re) => re.test(url.pathname))) {
      if (/review\/(run|rerolls)/.test(url.pathname)) await saveDerived();
      save();
    }
    return new Response(JSON.stringify(r.payload), { status: r.status, headers: { "Content-Type": "application/json" } });
  };

  // ------------------------------------------------------------ UI: header chip + panel
  const css = `
  .st-acct{margin-left:auto;display:flex;align-items:center;gap:.5rem;font-size:.85rem;white-space:nowrap}
  .st-acct img{width:22px;height:22px;border-radius:50%}
  .st-acct button,.st-gate button{font:inherit;cursor:pointer;border-radius:8px;border:1px solid var(--line,#8884);
    background:var(--card,#fff1);color:inherit;padding:.3rem .7rem}
  .st-acct .st-dot{width:8px;height:8px;border-radius:50%;background:#2a9d5c}
  .st-acct .st-dot.busy{background:#d99a1e}.st-acct .st-dot.err{background:#d1453b}
  .st-gate{position:fixed;inset:0;z-index:9000;display:flex;align-items:center;justify-content:center;
    background:color-mix(in srgb,var(--bg,#111) 85%,transparent);backdrop-filter:blur(3px);padding:16px}
  .st-gate .box{max-width:420px;width:100%;background:var(--card,#fff);color:var(--text,#111);border-radius:14px;
    padding:1.4rem;box-shadow:0 10px 40px #0004;border:1px solid var(--line,#8884)}
  .st-gate h2{margin:0 0 .5rem;font-size:1.2rem}.st-gate p{margin:.4rem 0;line-height:1.45;opacity:.85}
  .st-gate .row{display:flex;flex-direction:column;gap:.5rem;margin-top:1rem}
  .st-gate .discord{background:#5865F2;color:#fff;border-color:#5865F2;font-weight:600;padding:.6rem}
  .st-gate progress{width:100%;margin-top:.6rem}
  .st-gate .err{color:#d1453b}
  @media (max-width:560px){.st-acct>span:not(.st-dot){display:none}}`;

  function el(tag, attrs, ...kids) {
    const n = document.createElement(tag);
    Object.entries(attrs || {}).forEach(([k, v]) => {
      if (k.startsWith("on")) n.addEventListener(k.slice(2), v); else if (v != null) n.setAttribute(k, v);
    });
    kids.flat().forEach((k) => k != null && n.append(k.nodeType ? k : String(k)));
    return n;
  }

  let chip, gate;
  function paintChip() {
    const nav = document.querySelector("[data-st-nav]");
    if (!nav) return;
    if (!chip) { chip = el("div", { class: "st-acct" }); nav.insertBefore(chip, nav.querySelector(".st-theme")); }
    chip.replaceChildren();
    if (!user) {
      if (state.phase === "login") chip.append(el("button", { onclick: signIn }, "Σύνδεση με Discord"));
      return;
    }
    const dot = el("span", { class: "st-dot" + (state.error ? " err" : state.saved ? "" : " busy"),
                             title: state.error || (state.saved ? "αποθηκεύτηκε" : "αποθηκεύεται…") });
    if (user.avatar) chip.append(el("img", { src: user.avatar, alt: "" }));
    chip.append(el("span", {}, user.name), dot,
                el("button", { onclick: signOut }, user.mode === "local" ? "Σύνδεση" : "Έξοδος"));
  }

  function paintPanel(progress) {
    if (!document.body) return; // DOMContentLoaded paints it
    if (!gate) { gate = el("div", { class: "st-gate", role: "dialog", "aria-modal": "true" }); }
    const box = el("div", { class: "box" });
    if (state.phase === "login") {
      box.append(el("h2", {}, "Shop Titans — οι ήρωές σου"),
        el("p", {}, "Βάζεις τους ήρωές σου και το site λέει τι να αλλάξεις σε κάθε slot (item, element, spirit), " +
                    "τι λείπει από το ιδανικό build και ποια skills να κάνεις reroll."),
        el("p", {}, "Με τη σύνδεση, τα δεδομένα σου είναι μόνο δικά σου και τα βλέπεις από κάθε συσκευή."),
        el("div", { class: "row" },
          el("button", { class: "discord", onclick: signIn }, "Σύνδεση με Discord"),
          el("button", { onclick: () => { localStorage.setItem("st-local", "1"); start({ id: LOCAL_ID, mode: "local", name: "αυτός ο browser" }); } },
             "Δοκιμή χωρίς σύνδεση (μένει σε αυτόν τον browser)")));
    } else if (state.phase === "loading") {
      box.append(el("h2", {}, "Φορτώνει…"),
        el("p", {}, "Ο υπολογιστής του site τρέχει μέσα στον browser σου. Την πρώτη φορά κατεβαίνουν ~15 MB."),
        el("progress", {}));
    } else if (state.phase === "computing") {
      const p = progress || {};
      const label = p.step === "review" ? `Review: ${p.hero} (${p.done + 1}/${p.total})`
        : p.step === "rerolls" ? `Skills/reroll: ${p.hero} (${p.done + 1}/${p.total})`
          : p.step === "plan" ? "Πλάνο…" : p.step === "bucket" ? "Bucket list…" : "Ξεκινάει…";
      const frac = p.total ? ((p.step === "rerolls" ? p.total : 0) + (p.done || 0)) / (2 * p.total) : 0;
      box.append(el("h2", {}, "Υπολογισμός"), el("p", {}, label),
        el("p", {}, "Περίπου 5–10 δευτερόλεπτα ανά ήρωα. Μην κλείσεις τη σελίδα."),
        el("progress", { max: "1", value: String(p.step === "plan" || p.step === "bucket" ? 1 : frac) }));
    } else if (state.phase === "error") {
      box.append(el("h2", {}, "Κάτι δεν πήγε καλά"), el("p", { class: "err" }, state.error || ""),
        el("div", { class: "row" }, el("button", { onclick: () => location.reload() }, "Ξανά")));
    } else {
      gate.remove();
      return;
    }
    gate.replaceChildren(box);
    if (!gate.isConnected) document.body.append(gate);
  }

  async function signIn() {
    const client = await supabaseClient();
    if (!client) { alert("Η σύνδεση με Discord δεν έχει στηθεί ακόμα σε αυτό το site."); return; }
    localStorage.removeItem("st-local");
    await client.auth.signInWithOAuth({ provider: "discord", options: { redirectTo: location.origin + location.pathname } });
  }

  async function signOut() {
    if (user && user.mode === "local") { localStorage.removeItem("st-local"); location.reload(); return; }
    await saving;
    if (sb) await sb.auth.signOut();
    location.reload();
  }

  // ------------------------------------------------------------ for the account page
  window.STAccount = {
    ready,
    user: () => user,
    call,
    files: () => call("userFiles"),
    async put(rel, text) { await ready; await call("put", rel, text); save(); },
    async replaceAll(files) { await ready; await call("load", files, null); await idb.del("derived:" + user.id); await save(true); },
    async recompute() {
      await ready;
      state.phase = "computing";
      paintPanel({});
      const onReport = (p) => paintPanel(p);
      listeners.add(onReport);
      try {
        const r = await call("recompute");
        if (r.ok) { await saveDerived(); await save(true); }
        return r;
      } finally {
        listeners.delete(onReport);
        state.phase = "ready";
        paintPanel();
      }
    },
    flush: () => save(true),
  };

  document.addEventListener("DOMContentLoaded", () => {
    document.head.append(el("style", {}, css));
    paintChip();
    if (state.phase !== "ready") paintPanel();
  });
  boot();
})();
