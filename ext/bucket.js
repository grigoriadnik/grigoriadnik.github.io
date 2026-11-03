"use strict";
// Bucket list (session `bucket`): /ext/bucket.html is the page (its tab in the site menu comes from its <title>); on
// the heroes page this file only adds a small «Bucket list» panel under each hero / champion. API: web/ext/bucket.py.
(function () {
  const enc = encodeURIComponent;
  const fmt = (n, d) => (n == null ? "—" : new Intl.NumberFormat("el-GR", { maximumFractionDigits: d || 0 }).format(n));
  const signed = (n) => (n == null ? "—" : (n >= 0 ? "+" : "−") + fmt(Math.abs(n)));
  const QUAL = { Epic: "Epic+", Legendary: "Legendary" };
  const HOWSHORT = { craft: "Craft", enchant: "Craft ή Market", event: "Event ή Market", market: "Market",
    special: "Σπάνιο", luck: "Legendary (τύχη)", soul: "Titan Soul" };
  const SOUL = "consumable|Titan Soul";
  // What a group needs gathered, as a tag on its row (the craft-first order's tiers)
  const TIERTAG = { 0: "Craft", 1: "Enchants", 2: "Market", 3: "Σπάνιο / τύχη", 4: "Titan Soul" };
  const AVAIL = { common: "συχνό στο Market", chest: "από chest", "older-pack": "παλιό pack/event",
    new: "νέο, λίγο στο Market", rare: "σπάνιο" };

  function h(tag, attrs, ...kids) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v == null || v === false) continue;
      if (k === "class") el.className = v;
      else if (k === "text") el.textContent = v;
      else if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v === true ? "" : v);
    }
    for (const kid of kids.flat(Infinity)) {
      if (kid == null || kid === false) continue;
      el.append(kid instanceof Node ? kid : String(kid));
    }
    return el;
  }
  async function api(path, body) {
    const opts = body === undefined ? {} : {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    };
    const r = await fetch(path, opts);
    let j = null;
    try { j = await r.json(); } catch (e) { /* not JSON */ }
    if (!r.ok) throw new Error((j && j.error) || "HTTP " + r.status);
    return j;
  }
  const hm = (iso) => {
    if (!iso) return "—";
    const d = new Date(iso.replace(/([+-]\d\d)(\d\d)$/, "$1:$2"));
    return isNaN(d) ? iso : d.toLocaleString("el-GR", { day: "numeric", month: "numeric", hour: "2-digit", minute: "2-digit" });
  };
  const unitSlot = (g) => g.unit + (g.slot ? " · slot " + g.slot : "");
  const icon = (src, cls) => (src ? h("img", { src, class: cls || "bk-icon", alt: "", loading: "lazy" }) : h("span", { class: (cls || "bk-icon") + " bk-noicon" }));
  // A name that opens the shared info popup (web core's /static/info.js: data-info = the base name; a tap opens it,
  // Enter / Space too)
  const INFOKIND = { item: "item", element: "element", spirit: "spirit" };
  function infoAttrs(name, kind, cls) {
    return {
      class: cls || "bk-info", "data-info": name, "data-info-kind": INFOKIND[kind] || null, tabindex: "0", role: "button",
      onkeydown: (ev) => { if ((ev.key === "Enter" || ev.key === " ") && window.STInfo) { ev.preventDefault(); window.STInfo.open(name, INFOKIND[kind]); } },
    };
  }
  // A group's title with its item, element and spirit each opening its info
  function gTitle(g) {
    const c = g.change || {};
    if (!c.item) return g.title || "Promotion";
    const part = (name, kind, none) => (name ? h("span", infoAttrs(name, kind), name) : h("span", { class: "muted" }, none));
    return [h("span", infoAttrs(c.item, "item"), c.item), c.tier ? ` (T${c.tier}, ${c.quality})` : ` (${c.quality})`,
      " · ", part(c.element, "element", "χωρίς element"), " · ", part(c.spirit, "spirit", "χωρίς spirit")];
  }

  // =========================================================================== heroes page: panel
  const app = document.getElementById("bucket-app");
  if (!app) {
    let cache = null;
    let cacheAt = 0;
    if (window.ST && window.ST.registerPanel) {
      if (!document.querySelector('link[href="/ext/bucket.css"]')) {
        document.head.append(h("link", { rel: "stylesheet", href: "/ext/bucket.css" }));
      }
      window.ST.registerPanel("bucket", {
        kinds: ["hero", "champion"],
        async render(d, el) {
          el.classList.add("card");
          el.replaceChildren(h("h2", null, "Bucket list", h("span", { class: "right small" }, "φόρτωση…")));
          try {
            if (!cache || Date.now() - cacheAt > 20000) { cache = await api("/api/bucket"); cacheAt = Date.now(); }
          } catch (e) {
            el.replaceChildren(h("h2", null, "Bucket list"), h("div", { class: "note bad", text: e.message }));
            return;
          }
          const gs = cache.groups.filter((g) => g.unit === d.id || g.unit === d.name).sort((a, b) => a.prio - b.prio);
          const link = h("a", { href: "/ext/bucket.html#q=" + enc(d.name || d.id) }, "όλη η λίστα →");
          el.replaceChildren(h("h2", null, "Bucket list", h("span", { class: "right small" }, link)));
          if (!gs.length) { el.append(h("p", { class: "muted" }, "Τίποτα να μαζέψεις για αυτόν τώρα.")); return; }
          el.append(h("ul", { class: "bk-mini" }, gs.map((g) => h("li", { class: g.ready ? "ready" : "" },
            h("span", { class: "bk-badge " + (g.ready ? "ok" : "miss") }, g.ready ? "Έτοιμο" : "Λείπουν " + g.missing),
            " ", h("span", { class: "muted small", title: "Θέση στη σειρά προτεραιότητας (μεγαλύτερο κέρδος πρώτα)" }, "#" + g.prio + " "), h("b", null, g.slot ? "slot " + g.slot + ": " : ""), gTitle(g),
            h("span", { class: "muted" }, " · " + signed(g.gain) + " power"),
            h("div", { class: "small muted" }, g.needs.filter((n) => !n.stock).map((n, i) =>
              [i ? " · " : "", n.qty + "× ", h("span", infoAttrs(n.name, n.kind), n.name),
                (n.quality ? " " + (QUAL[n.quality] || "") : "") + (n.missing ? "" : " ✓")]),
              g.soulRank ? " · " + g.soulRank + "η στη σειρά του Titan Soul" : null)))));
        },
      });
    }
    return;
  }

  // =========================================================================== the bucket page
  const UI = { view: "groups", filter: "all", missingOnly: true, q: "", order: "priority", esort: "unlocks", edir: "desc" };
  try { Object.assign(UI, JSON.parse(localStorage.getItem("bk-ui") || "{}")); } catch (e) { /* storage off */ }
  const OLDSORT = { power: ["unlocks", "desc"], piece: ["perPiece", "desc"], kind: ["how", "asc"] };  // the earlier tabs
  if (OLDSORT[UI.esort]) [UI.esort, UI.edir] = OLDSORT[UI.esort];
  if (UI.filter === "promotion") UI.filter = "soul";
  const fromHash = new URLSearchParams(location.hash.slice(1)).get("q");
  if (fromHash) UI.q = fromHash;
  const saveUI = () => { try { localStorage.setItem("bk-ui", JSON.stringify({ view: UI.view, filter: UI.filter, missingOnly: UI.missingOnly, powerOpen: UI.powerOpen, order: UI.order, esort: UI.esort, edir: UI.edir })); } catch (e) { /* storage off */ } };
  let S = null;
  let busy = false;

  let toastTimer = null;
  function toast(text, bad) {
    const t = document.getElementById("bk-toast");
    t.textContent = text;
    t.className = "bk-toast" + (bad ? " bad" : "");
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.hidden = true; }, bad ? 6000 : 1800);
  }

  async function load() {
    try {
      S = await api("/api/bucket");
      render();
    } catch (e) {
      app.replaceChildren(h("div", { class: "note bad", text: "Δεν φόρτωσε η λίστα: " + e.message }));
    }
  }

  async function send(path, body, msg) {
    if (busy) return;
    busy = true;
    document.body.classList.add("bk-busy");
    try {
      S = await api(path, body);
      render();
      toast(msg || "Αποθηκεύτηκε");
    } catch (e) {
      toast("Δεν αποθηκεύτηκε: " + e.message, true);
      render();
    } finally {
      busy = false;
      document.body.classList.remove("bk-busy");
    }
  }
  const edit = (change, msg) => send("/api/bucket/edit", { changes: [change] }, msg);

  // --- one entry's editable cells (the same entry shows in every group that needs it)
  function qtyCell(e, field) {
    const own = e.owner && e.owner[field] != null;
    const input = h("input", {
      type: "number", min: "0", max: "100000", step: "1", inputmode: "numeric", value: String(e[field]),
      class: "bk-qty" + (own ? " own" : ""), "data-key": e.key, "data-field": field,
      "aria-label": (field === "needed" ? "Χρειάζεσαι: " : "Έχεις: ") + e.name,
      onchange: (ev) => {
        const raw = ev.target.value.trim();
        const v = raw === "" ? null : Number(raw);
        if (v != null && (!Number.isInteger(v) || v < 0 || v > 100000)) { toast("Γράψε ακέραιο από 0 έως 100000", true); ev.target.value = e[field]; return; }
        edit({ key: e.key, [field]: v });
      },
      onkeydown: (ev) => { if (ev.key === "Enter") ev.target.blur(); },
    });
    const reset = own ? h("button", {
      class: "bk-reset", type: "button",
      title: field === "have" ? "Πίσω στο νούμερο του κινητού" : "Πίσω στο νούμερο της λίστας (" + e.generatedNeeded + ")",
      onclick: () => edit({ key: e.key, [field]: null }, "Πίσω στο αυτόματο"),
    }, "↺") : null;
    let hint = null;
    if (field === "have") {
      if (e.phone == null) hint = null;
      else if (own) {
        const since = (e.ownerSince || []).map((x) => (x.delta > 0 ? "+" : "−") + Math.abs(x.delta) + " " + (x.step || "")).join(", ");
        hint = h("div", { class: "bk-hint" + (e.conflict ? " bad" : "") },
          (since ? "δικό σου " + fmt(e.owner.have) + ", " + since + " · " : "") + "αποθήκη: " + fmt(e.phone));
      } else hint = h("div", { class: "bk-hint" }, e.kind === "consumable" ? "από την αποθήκη (Special)" : "από την αποθήκη");
    } else if (field === "needed") {
      const bits = [];
      if (e.reservedQty) bits.push(e.reservedQty + " για βήματα");
      if (e.unplanned) bits.push(e.unplanned + " χωρίς βήμα ακόμα");
      if (own && e.neededChanged) bits.push("η λίστα άλλαξε σε " + e.generatedNeeded);
      hint = bits.length ? h("div", { class: "bk-hint" + (e.neededChanged ? " warn" : "") }, bits.join(" · ")) : null;
    }
    return h("div", { class: "bk-cell" }, h("div", { class: "bk-cellrow" }, input, reset), hint);
  }
  function doneCell(e) {
    const coveredByPhone = !e.remaining && !e.done && e.haveSource === "phone";
    return h("input", {
      type: "checkbox", class: "bk-done", checked: !e.remaining, disabled: coveredByPhone || e.needed === 0,
      title: coveredByPhone ? "Το καλύπτει ήδη το κινητό" : e.done ? "Το τσέκαρες: ξε-τσέκαρε για να γυρίσει στο κινητό" : "Τα έχω όλα",
      "aria-label": "Τα έχω όλα: " + e.name,
      onchange: (ev) => edit({ key: e.key, done: ev.target.checked }, ev.target.checked ? "Σημειώθηκε ότι τα έχεις" : "Πίσω στο κινητό"),
    });
  }
  function whatCell(e, extra) {
    return h("div", infoAttrs(e.name, e.kind, "bk-what"), icon(e.icon),
      h("div", null,
        h("div", { class: "bk-name" }, h("span", { class: "bk-nm" }, e.name),
          e.quality ? h("span", { class: "bk-q q-" + e.quality.toLowerCase() }, QUAL[e.quality] || e.quality) : null,
          extra),
        h("div", { class: "bk-sub" }, { item: "item", element: "element enchant", spirit: "spirit enchant", consumable: "Inventory > Special" }[e.kind] || e.kind)));
  }
  function howCell(how) {
    const av = how.availability && AVAIL[how.availability];
    return h("div", { class: "bk-how k-" + how.kind, title: how.detail || "" },
      h("span", { class: "bk-howtag" }, HOWSHORT[how.kind] || how.label), av ? h("div", { class: "bk-hint" }, av) : null);
  }

  // --- filters
  const gatherLines = (g) => g.needs.filter((n) => !n.stock);
  const isBuy = (n) => n.kind === "item" && ["market", "special", "luck"].includes(n.how.kind);
  const GFILTER = {
    all: () => true,
    craft: (g) => gatherLines(g).some((n) => n.kind === "item" && n.how.kind === "craft"),
    buy: (g) => gatherLines(g).some(isBuy),
    enchants: (g) => gatherLines(g).some((n) => n.kind === "element" || n.kind === "spirit"),
    soul: (g) => g.needs.some((n) => n.entry === SOUL),
  };
  const EFILTER = {
    all: () => true,
    craft: (e) => e.kind === "item" && e.how.kind === "craft",
    buy: (e) => e.kind === "item" && ["market", "special", "luck"].includes(e.how.kind),
    enchants: (e) => e.kind === "element" || e.kind === "spirit",
    soul: (e) => e.key === SOUL,
  };
  const matchQ = (text) => !UI.q || text.toLowerCase().includes(UI.q.toLowerCase());

  // --- page
  function render() {
    const keep = document.activeElement && document.activeElement.dataset && document.activeElement.dataset.key
      ? [document.activeElement.dataset.key, document.activeElement.dataset.field] : null;
    const y = window.scrollY;
    const src = S.sources || {};
    const pp = document.getElementById("bk-phone");
    pp.hidden = false;
    pp.textContent = "Αποθήκη: " + hm(S.inventoryAt) + (src.inventoryLocal ? " + βήματα" : "");
    pp.title = "Διάβασμα από το κινητό: " + hm(S.inventoryAt) +
      (src.inventoryLocal ? " · μετά, ό,τι πήραν τα βήματα του execute (ως " + hm(src.inventoryLocal) + ")" : "");
    const rp = document.getElementById("bk-review");
    rp.hidden = false;
    rp.textContent = "Πλάνο: " + hm(src.plan);
    rp.title = "Review " + hm(src.review) + " · πλάνο του execute " + hm(src.plan) + " · λίστα " + hm(S.generatedAt);

    app.replaceChildren(summary(), powerCard(), alerts(), controls(), UI.view === "groups" ? groupsView() : entriesView());
    window.scrollTo(0, y);
    if (keep) {
      const el = app.querySelector(`input[data-key="${CSS.escape(keep[0])}"][data-field="${keep[1]}"]`);
      if (el) el.focus();
    }
  }

  function summary() {
    const t = S.totals;
    const by = t.byHow || {};
    const stat = (n, label, cls) => h("div", { class: "bk-stat " + (cls || "") }, h("div", { class: "n" }, fmt(n)), h("div", { class: "l" }, label));
    return h("section", { class: "card bk-summary" },
      h("div", { class: "bk-stats" },
        stat(t.ready, "έτοιμες για session", t.ready ? "ok" : ""),
        stat(t.groups, "upgrades στη λίστα"),
        stat(t.remainingQty, "πράγματα λείπουν"),
        stat((by.craft || 0), "να φτιάξεις (craft)"),
        stat((by.enchant || 0) + (by.event || 0), "enchants"),
        stat((by.market || 0) + (by.special || 0) + (by.luck || 0), "από το Market"),
        t.souls ? h("div", { class: "bk-stat" + (t.souls.covered ? " ok" : ""), title: "Κάθε Titan Soul πάει σε ένα από τα " + t.souls.uses + " (promotion ή Upgrade Class), με τη σειρά του κέρδους· δεν είναι " + t.souls.uses + " ξεχωριστές ελλείψεις" },
          h("div", { class: "n" }, fmt(t.souls.have), h("small", null, " / " + t.souls.uses)), h("div", { class: "l" }, "Titan Soul: έχεις / χρήσεις")) : null),
      h("p", { class: "muted small bk-explain" },
        "«Χρειάζεσαι» = όλα όσα θέλουν τα upgrades (μαζί με όσα κρατάει ήδη το πλάνο από την αποθήκη σου). ",
        "«Έχεις» = η αποθήκη όπως τη διάβασε το κινητό στην αρχή του session, μείον ό,τι πήραν τα βήματα μετά (κάρτες Epic ή Legendary), ή το δικό σου νούμερο. ",
        "Ό,τι έχεις πάει πρώτα στα βήματα του πλάνου, μετά στα upgrades με σειρά προτεραιότητας (μεγαλύτερο κέρδος ανά κομμάτι που λείπει πρώτα). ",
        "Όταν μια ομάδα έχει όλα της, γίνεται «Έτοιμο για session»."),
      h("div", { class: "bk-actions" },
        h("button", { class: "bk-btn", type: "button", onclick: () => send("/api/bucket/regenerate", {}, "Η λίστα ξαναφτιάχτηκε") }, "Ξαναφτιάξε τη λίστα"),
        h("span", { class: "muted small" }, "Φτιάχνεται μόνη της όταν αλλάξει το review, το πλάνο ή η αποθήκη · τελευταία: " + hm(S.generatedAt))));
  }

  // --- power per hero / champion, now and after the whole plan
  function powerCard() {
    const rows = S.power || [];
    if (!rows.length) return null;
    const det = h("details", { class: "card bk-power", open: UI.powerOpen !== false });
    det.addEventListener("toggle", () => { UI.powerOpen = det.open; saveUI(); });
    const table = (kind, label) => {
      const list = rows.filter((r) => r.kind === kind);
      const sum = (f) => list.reduce((a, r) => a + (r[f] || 0), 0);
      const promo = sum("promotion");
      return h("div", { class: "bk-pscroll" }, h("table", { class: "bk-ptable" },
        h("thead", null, h("tr", null, h("th", null, label), h("th", { class: "n" }, "Τώρα"), h("th", { class: "n" }, "Αν τα πάρεις όλα"),
          h("th", { class: "n" }, "Κέρδος"), kind === "hero" ? h("th", { class: "n" }, "+ Promotion ≈") : null, h("th", { class: "n" }, "Από το ταβάνι"))),
        h("tbody", null, list.map((r) => h("tr", null,
          h("td", null, h("b", null, r.unit), r.class && kind === "hero" ? h("span", { class: "muted small" }, " · " + r.class) : null),
          h("td", { class: "n" }, fmt(r.now)),
          h("td", { class: "n" }, h("b", null, fmt(r.after))),
          h("td", { class: "n bk-up" }, r.gain ? signed(r.gain) + (r.now ? " (" + fmt(100 * r.gain / r.now, 0) + "%)" : "") : "—"),
          kind === "hero" ? h("td", { class: "n" }, r.promotion ? signed(r.promotion) : "") : null,
          h("td", { class: "n muted" }, r.afterPct != null ? fmt(r.afterPct, 1) + "%" : "—")))),
        h("tfoot", null, h("tr", null, h("td", null, "Σύνολο"), h("td", { class: "n" }, fmt(sum("now"))),
          h("td", { class: "n" }, h("b", null, fmt(sum("after")))), h("td", { class: "n bk-up" }, signed(sum("gain"))),
          kind === "hero" ? h("td", { class: "n" }, promo ? signed(promo) : "") : null, h("td", null)))));
    };
    det.append(h("summary", null, "Power ανά ήρωα: τώρα και αν τα πάρεις όλα"),
      h("p", { class: "muted small" }, "«Αν τα πάρεις όλα» = όλο το πλάνο: ό,τι θέλει αυτή η λίστα μαζί με όσα καλύπτει ήδη η αποθήκη, με τα enchants που λείπουν μέσα (calc). ",
        "Το promotion μετριέται χωριστά, πάνω στο σημερινό gear (≈). Seeds και rerolls δεν μετράνε εδώ. «Από το ταβάνι» = πόσο κοντά στο καλύτερο δυνατό build φτάνει ο ήρωας μετά το πλάνο."),
      h("div", { class: "bk-pwrap" }, table("hero", "Ήρωας"), table("champion", "Champion")));
    return det;
  }

  function alerts() {
    const box = h("div", { class: "bk-alerts" });
    for (const w of S.warnings || []) box.append(h("div", { class: "note warn" }, w));
    if (S.conflicts && S.conflicts.length) {
      const ents = Object.fromEntries(S.entries.map((e) => [e.key, e]));
      box.append(h("section", { class: "card bk-conflicts" },
        h("h2", null, "Διαφέρει από το κινητό (" + S.conflicts.length + ")"),
        h("p", { class: "muted small" }, "Είχες γράψει δικό σου νούμερο, και μετά η αποθήκη διαβάστηκε ξανά από το κινητό (" + hm(S.inventoryAt) + ") με άλλο. Διάλεξε ποιο ισχύει."),
        S.conflicts.map((k) => {
          const e = ents[k];
          return h("div", { class: "bk-conflict" },
            whatCell(e),
            h("div", null, "δικό σου ", h("b", null, fmt(e.have)), " · κινητό ", h("b", null, fmt(e.phone))),
            h("div", { class: "bk-actions" },
              h("button", { class: "bk-btn", type: "button", onclick: () => send("/api/bucket/resolve", { key: k, use: "phone" }, "Κράτησα του κινητού") }, "Του κινητού (" + fmt(e.phone) + ")"),
              h("button", { class: "bk-btn ghost", type: "button", onclick: () => send("/api/bucket/resolve", { key: k, use: "mine" }, "Κράτησα το δικό σου") }, "Το δικό μου (" + fmt(e.have) + ")")));
        })));
    }
    const ch = S.changes;
    if (ch && (ch.done.length || ch.inPlan.length || ch.dropped.length)) {
      const list = (arr, label) => (arr.length ? h("div", null, h("b", null, label + " (" + arr.length + "): "),
        arr.map((g) => unitSlot(g) + " " + (g.title || "") + (g.step ? " → " + g.step : "")).join(" · ")) : null);
      box.append(h("details", { class: "card bk-changes" },
        h("summary", null, "Τι άλλαξε στο τελευταίο ξαναφτιάξιμο (" + hm(ch.at) + ")"),
        list(ch.done, "Έγιναν"), list(ch.inPlan, "Δεν θέλουν πια τίποτα, είναι στο πλάνο"), list(ch.dropped, "Βγήκαν από τη λίστα")));
    }
    if (S.orphanEdits && S.orphanEdits.length) {
      box.append(h("div", { class: "note" }, "Κρατάω " + S.orphanEdits.length + " δικές σου αλλαγές για πράγματα που δεν είναι πια στη λίστα (ξαναεμφανίζονται αν επιστρέψουν)."));
    }
    return box;
  }

  function controls() {
    const tab = (v, label) => h("button", { type: "button", class: "bk-tab" + (UI.view === v ? " on" : ""), "aria-pressed": UI.view === v ? "true" : "false", onclick: () => { UI.view = v; saveUI(); render(); } }, label);
    const chip = (f, label) => h("button", { type: "button", class: "bk-chip" + (UI.filter === f ? " on" : ""), "aria-pressed": UI.filter === f ? "true" : "false", onclick: () => { UI.filter = f; saveUI(); render(); } }, label);
    const search = h("input", {
      type: "search", class: "bk-search", placeholder: "Ήρωας ή item…", value: UI.q, "aria-label": "Αναζήτηση",
      oninput: (ev) => { UI.q = ev.target.value; clearTimeout(search._t); search._t = setTimeout(() => { render(); const s = app.querySelector(".bk-search"); if (s) { s.focus(); s.setSelectionRange(s.value.length, s.value.length); } }, 200); },
    });
    const opt = (field, v, label, title) => h("button", { type: "button", class: "bk-tab" + (UI[field] === v ? " on" : ""), "aria-pressed": UI[field] === v ? "true" : "false", title: title || null, onclick: () => { UI[field] = v; saveUI(); render(); } }, label);
    // «Ανά πράγμα» sorts by its column headers (on a phone: the «Ταξινόμηση» select above the list)
    const order = UI.view === "groups"
      ? h("div", { class: "bk-tabs", role: "group", "aria-label": "Σειρά" },
        opt("order", "priority", "Μεγαλύτερο κέρδος πρώτα", "Power ανά κομμάτι που λείπει"), opt("order", "craft", "Craft πρώτα", "Craft, μετά enchants, Market, σπάνια, Titan Soul"))
      : null;
    return h("div", { class: "bk-controls" },
      h("div", { class: "bk-tabs", role: "group", "aria-label": "Προβολή" }, tab("groups", "Ανά upgrade"), tab("entries", "Ανά πράγμα")),
      order,
      h("div", { class: "bk-chips", role: "group", "aria-label": "Φίλτρο" },
        chip("all", "Όλα"), chip("craft", "Craft"), chip("buy", "Αγορά (Market)"), chip("enchants", "Enchants"), chip("soul", "Titan Soul")),
      h("label", { class: "bk-check" }, h("input", { type: "checkbox", checked: UI.missingOnly, onchange: (ev) => { UI.missingOnly = ev.target.checked; saveUI(); render(); } }), " μόνο όσα θέλουν κάτι"),
      search);
  }

  // --- by upgrade
  function groupsView() {
    const ents = Object.fromEntries(S.entries.map((e) => [e.key, e]));
    const gs = S.groups.filter((g) => (GFILTER[UI.filter] || GFILTER.all)(g) && matchQ(g.unit + " " + (g.title || "") + " " + g.needs.map((n) => n.name).join(" ")));
    const byPrio = UI.order === "priority";
    if (byPrio) gs.sort((a, b) => a.prio - b.prio);
    const ready = gs.filter((g) => g.ready);
    const rest = gs.filter((g) => !g.ready);
    const wrap = h("div", { class: "bk-groups" });
    wrap.append(h("section", { class: "bk-tier ready" },
      h("h2", { class: "bk-tierh" }, "Έτοιμα για session", h("span", { class: "bk-count" }, ready.length)),
      ready.length ? ready.map((g) => groupCard(g, ents)) :
        h("p", { class: "muted" }, "Καμία ομάδα δεν είναι πλήρης ακόμα. Όταν μαζέψεις ό,τι θέλει μια ομάδα, εμφανίζεται εδώ και ξεκινάμε session.")));
    if (UI.missingOnly && !rest.length && !ready.length) wrap.append(h("p", { class: "muted" }, "Τίποτα με αυτό το φίλτρο."));
    if (byPrio) {
      if (rest.length) wrap.append(h("section", { class: "bk-tier" },
        h("h2", { class: "bk-tierh" }, "Μεγαλύτερο κέρδος πρώτα", h("span", { class: "bk-count" }, rest.length),
          h("span", { class: "muted small" }, "power ανά κομμάτι που λείπει · ό,τι μαζέψεις πάει πρώτα στα πρώτα")),
        rest.map((g) => groupCard(g, ents))));
      return wrap;
    }
    const tiers = {};
    for (const g of rest) (tiers[g.tier] = tiers[g.tier] || []).push(g);
    for (const [tier, list] of Object.entries(tiers).sort((a, b) => a[0] - b[0])) {
      wrap.append(h("details", { class: "bk-tier", open: true },
        h("summary", { class: "bk-tierh" }, (S.tiers || {})[tier] || "—", h("span", { class: "bk-count" }, list.length),
          h("span", { class: "muted small" }, tierHelp(tier))),
        list.every((g) => g.soulRank) && ents[SOUL] ? soulCard(ents[SOUL], list) : list.map((g) => groupCard(g, ents))));
    }
    return wrap;
  }
  function tierHelp(t) {
    return { 0: "μόνο craft: το πιο φθηνό", 1: "θέλουν enchants (craft ή Market)", 2: "θέλουν αγορά από το Market",
      3: "σπάνια ή Legendary με τύχη: τα συζητάμε πριν", 4: "1 Titan Soul το καθένα: κάθε soul πάει στο επόμενο της σειράς" }[t] || "";
  }
  // The Titan Soul: one entry, many uses. Each soul goes to one of them, the best gain first (the list's order), so
  // the uses are a ranking, not separate shortages that add up.
  function soulCard(e, shown) {
    const want = new Set(shown.map((g) => g.id));
    const uses = e.uses || [];
    const next = uses.find((u) => !u.covered);
    return h("article", { class: "bk-group bk-soul" },
      h("header", { class: "bk-ghead" },
        h("span", { class: "bk-rank" }, "★"),
        h("div", { class: "bk-gtitle" },
          h("div", null, h("b", infoAttrs("Titan Soul"), "Titan Soul"), " ", h("span", { class: "chip warn", title: "Είδαμε μόνο το Titan Soul· άλλο κόστος (gold, ίσως gems) φαίνεται στο session" }, "⚠ gems;")),
          h("div", { class: "bk-gname" }, "1 Titan Soul για καθένα από τα " + uses.length + " — κάθε soul πάει στο επόμενο της σειράς"),
          h("div", { class: "small muted" }, "Έχεις " + fmt(e.have) + (next ? " · το επόμενο πάει στον " + next.unit + " (" + signed(next.gain) + ")" : " · καλύπτονται όλα"))),
        h("div", { class: "bk-gain" }, h("div", { class: "n" }, next ? signed(next.gain) : "✓"),
          h("div", { class: "small muted" }, "power με το επόμενο soul")),
        h("span", { class: "bk-badge " + (next ? "miss" : "ok") }, next ? "Έχεις " + fmt(e.have) + " / " + uses.length : "Έτοιμο")),
      h("table", { class: "bk-needs" },
        h("thead", null, h("tr", null, h("th", null, "Τι"), h("th", null, "Πώς"),
          h("th", null, "Χρειάζεσαι", h("small", null, " για όλα")), h("th", null, "Έχεις"), h("th", { class: "c" }, "Λείπουν"), h("th", { class: "c" }, "Τα έχω"))),
        h("tbody", null, h("tr", { class: e.remaining ? "miss" : "" },
          h("td", { "data-l": "Τι" }, whatCell(e)),
          h("td", { "data-l": "Πώς" }, howCell(e.how)),
          h("td", { "data-l": "Χρειάζεσαι" }, qtyCell(e, "needed")),
          h("td", { "data-l": "Έχεις" }, qtyCell(e, "have")),
          h("td", { "data-l": "Λείπουν", class: "c bk-rem" + (e.remaining ? " miss" : "") }, fmt(e.remaining)),
          h("td", { "data-l": "Τα έχω", class: "c" }, doneCell(e))))),
      h("table", { class: "bk-needs bk-souls" },
        h("thead", null, h("tr", null, h("th", { class: "c" }, "Σειρά"), h("th", null, "Πού πάει"), h("th", { class: "n" }, "Κέρδος"), h("th", null, "Βήμα"), h("th", { class: "c" }, "Soul"))),
        h("tbody", null, uses.map((u) => h("tr", { class: (u.covered ? "ok" : "miss") + (want.has(u.group) || u.covered ? "" : " bk-dim") },
          h("td", { "data-l": "Σειρά", class: "c" }, h("b", null, u.n + "ο")),
          h("td", { "data-l": "Πού πάει" }, h("b", null, u.unit), u.unitKind === "champion" ? h("span", { class: "chip accent" }, "champion") : null, h("div", { class: "small muted" }, u.title)),
          h("td", { "data-l": "Κέρδος", class: "n" }, signed(u.gain), u.gainPct != null ? h("div", { class: "small muted" }, fmt(u.gainPct, 1) + "%") : null),
          h("td", { "data-l": "Βήμα", class: "small" }, u.steps && u.steps.length ? u.steps.join(", ") : "κίνηση του review"),
          h("td", { "data-l": "Soul", class: "c" }, u.covered ? h("span", { class: "bk-ok", title: u.ready ? "Έτοιμο για session" : "" }, "✓") : h("span", { class: "bk-miss" }, "περιμένει")))))),
      h("ul", { class: "bk-notes small muted" },
        h("li", null, "Κόστος: 1 Titan Soul το καθένα (το κόκκινο «1» στην οθόνη promotion του ήρωα και στο «+» δίπλα στην κλάση του champion). Είδαμε μόνο αυτό: gold ή άλλα υλικά ίσως από πάνω, διαβάζονται στο session πριν από το OK."),
        h("li", null, "Η σειρά είναι με το κέρδος power (calc): όσα Titan Soul έχεις πάνε στα πρώτα της λίστας. Το «Χρειάζεσαι» είναι για να γίνουν όλα."),
        h("li", null, "Από πού βγαίνει το Titan Soul δεν το έχουμε στα δεδομένα.")));
  }
  function groupCard(g, ents) {
    const flags = [];
    if (g.gems == null) flags.push(h("span", { class: "chip warn", title: g.soulRank ? "Είδαμε μόνο το Titan Soul· άλλο κόστος (gold, ίσως gems) φαίνεται στο session" : "Market: συνήθως gold· gems μόνο αν ο πωλητής ζητά gems" }, "⚠ gems;"));
    if (g.soulRank) flags.push(h("span", { class: "chip", title: "Κάθε Titan Soul πάει σε ένα, με τη σειρά του κέρδους" }, "Titan Soul " + g.soulRank + "ο"));
    const tier = g.ownTier != null ? g.ownTier : g.tier;
    if (UI.order === "priority") flags.unshift(h("span", { class: "chip bk-src t" + tier, title: (S.tiers || {})[tier] || "" }, TIERTAG[tier] || "—"));
    if (g.unitKind === "champion") flags.push(h("span", { class: "chip accent" }, "champion"));
    if (g.status === "waits-enchant") flags.push(h("span", { class: "chip" }, "περιμένει enchant"));
    const steps = g.steps && g.steps.length ? "βήμα " + g.steps.join(", ") : g.source === "review" ? "κίνηση του review" : "";
    const sub = [g.instead ? "αντί για " + g.instead : null, steps].filter(Boolean).join(" · ");
    const rows = g.needs.map((n) => {
      const e = ents[n.entry];
      if (!e) return null;
      const here = n.missing ? h("span", { class: "bk-miss" }, "λείπει " + n.missing) : h("span", { class: "bk-ok" }, "✓");
      return h("tr", { class: n.missing ? "miss" : "" },
        h("td", { "data-l": "Τι" }, whatCell(e, n.stock ? h("span", { class: "bk-tag", title: "Το πλάνο το παίρνει από την αποθήκη σου" }, "από την αποθήκη") : null)),
        h("td", { "data-l": "Πώς" }, n.stock ? h("span", { class: "muted small" }, "κρατημένο") : howCell(e.how)),
        h("td", { "data-l": "Εδώ", class: "c" }, n.qty + "× ", here),
        h("td", { "data-l": "Χρειάζεσαι" }, qtyCell(e, "needed")),
        h("td", { "data-l": "Έχεις" }, qtyCell(e, "have")),
        h("td", { "data-l": "Λείπουν", class: "c bk-rem" + (e.remaining ? " miss" : "") }, fmt(e.remaining)),
        h("td", { "data-l": "Τα έχω", class: "c" }, doneCell(e)));
    });
    return h("article", { class: "bk-group" + (g.ready ? " ready" : ""), id: "g-" + g.rank },
      h("header", { class: "bk-ghead" },
        h("span", { class: "bk-rank", title: UI.order === "priority" ? "Σειρά προτεραιότητας (craft-πρώτα: #" + g.rank + ")" : "Σειρά craft-πρώτα (προτεραιότητα: #" + g.prio + ")" }, "#" + (UI.order === "priority" ? g.prio : g.rank)),
        icon(g.change && g.change.icon, "bk-gicon"),
        h("div", { class: "bk-gtitle" },
          h("div", null, h("b", null, unitSlot(g)), g.class ? h("span", { class: "muted" }, " · " + g.class) : null, " ", flags),
          h("div", { class: "bk-gname" }, gTitle(g)),
          sub ? h("div", { class: "small muted" }, sub) : null),
        h("div", { class: "bk-gain" }, h("div", { class: "n" }, signed(g.gain)),
          h("div", { class: "small muted" }, "power" + (g.gainPct != null ? " · " + fmt(g.gainPct, 1) + "%" : "")),
          g.perPiece != null && g.missing > 1 ? h("div", { class: "small muted" }, signed(g.perPiece) + " ανά κομμάτι") : null),
        h("span", { class: "bk-badge " + (g.ready ? "ok" : "miss") }, g.ready ? "Έτοιμο για session" : g.waitsFor ? "Μετά από άλλη ομάδα" : "Λείπουν " + g.missing)),
      h("table", { class: "bk-needs" },
        h("thead", null, h("tr", null, h("th", null, "Τι"), h("th", null, "Πώς"), h("th", { class: "c" }, "Εδώ"),
          h("th", null, "Χρειάζεσαι", h("small", null, " σύνολο")), h("th", null, "Έχεις"), h("th", { class: "c" }, "Λείπουν"), h("th", { class: "c" }, "Τα έχω"))),
        h("tbody", null, rows)),
      (g.notes && g.notes.length) || (g.alternatives && g.alternatives.length) ? h("ul", { class: "bk-notes small muted" },
        (g.notes || []).map((n) => h("li", null, n)),
        g.alternatives && g.alternatives.length ? h("li", null, "Εναλλακτικά: " + g.alternatives.map((a) => a.title + (a.gain != null ? " (" + signed(a.gain) + ")" : "")).join(" · ")) : null) : null);
  }

  // --- by thing
  function entriesView() {
    const es = S.entries.filter((e) => (EFILTER[UI.filter] || EFILTER.all)(e) && (!UI.missingOnly || e.remaining) &&
      matchQ(e.name + " " + e.for.map((f) => f.unit).join(" ")));
    if (!es.length) return h("p", { class: "muted" }, "Τίποτα με αυτό το φίλτρο.");
    sortEntries(es);
    const sel = h("select", {
      class: "bk-esel", "aria-label": "Ταξινόμηση",
      onchange: (ev) => { [UI.esort, UI.edir] = ev.target.value.split(":"); saveUI(); render(); },
    }, Object.entries(ECOLS).flatMap(([k, c]) => ["desc", "asc"].map((d) =>
      h("option", { value: k + ":" + d, selected: UI.esort === k && UI.edir === d }, c.label + " — " + c.dirs[d]))));
    return h("section", { class: "card bk-entries" },
      h("label", { class: "bk-esort" }, h("span", { class: "muted small" }, "Ταξινόμηση"), sel),
      h("table", { class: "bk-needs bk-etable" },
        h("thead", null, h("tr", null, sortTh("name"), sortTh("how"), h("th", null, "Για"),
          sortTh("unlocks", "n"), sortTh("perPiece", "n"),
          sortTh("needed"), sortTh("have"), sortTh("remaining", "c"), h("th", { class: "c" }, "Τα έχω"))),
        h("tbody", null, es.map((e) => h("tr", { class: e.remaining ? "miss" : "" },
          h("td", { "data-l": "Τι" }, whatCell(e)),
          h("td", { "data-l": "Πώς" }, howCell(e.how)),
          h("td", { "data-l": "Για", class: "small" }, forText(e)),
          h("td", { "data-l": "Ξεκλειδώνει (σύνολο)", class: "n" }, powerCell(e)),
          h("td", { "data-l": "Ξεκλειδώνει ανά κομμάτι", class: "n" }, powerCell(e, true)),
          h("td", { "data-l": "Χρειάζεσαι" }, qtyCell(e, "needed")),
          h("td", { "data-l": "Έχεις" }, qtyCell(e, "have")),
          h("td", { "data-l": "Λείπουν", class: "c bk-rem" + (e.remaining ? " miss" : "") }, fmt(e.remaining)),
          h("td", { "data-l": "Τα έχω", class: "c" }, doneCell(e)))))));
  }
  // Columns of «Ανά πράγμα» that sort: a header click sorts by it, a second click reverses. Numbers start biggest
  // first, text Α→Ω, «Πώς» craft first. Ties keep the server's order. The choice is kept per viewer (bk-ui).
  const HOWORDER = ["craft", "enchant", "event", "market", "special", "luck", "soul"];
  const NUM = { desc: "μεγαλύτερα πρώτα", asc: "μικρότερα πρώτα" };
  const ECOLS = {
    unlocks: { label: "Ξεκλειδώνει (σύνολο)", head: ["Ξεκλειδώνει", "σύνολο"], val: (e) => e.unlocksPower || 0, dirs: NUM,
      title: "Για κάθε upgrade που το περιμένει: το κέρδος του × το μερίδιό του σε όσα λείπουν. Titan Soul: το επόμενο της σειράς" },
    perPiece: { label: "Ξεκλειδώνει ανά κομμάτι", head: ["Ξεκλειδώνει", "ανά κομμάτι"], val: (e) => e.perPiece || 0, dirs: NUM, title: "Το σύνολο ÷ τα κομμάτια που λείπουν στα upgrades" },
    remaining: { label: "Λείπουν", val: (e) => e.remaining, dirs: NUM },
    needed: { label: "Χρειάζεσαι", val: (e) => e.needed, dirs: NUM },
    have: { label: "Έχεις", val: (e) => e.have, dirs: NUM },
    name: { label: "Τι", val: (e) => e.name + " " + (e.quality || ""), dirs: { asc: "Α→Ω", desc: "Ω→Α" }, asc: true },
    how: { label: "Πώς", val: (e) => HOWORDER.indexOf(e.how.kind), dirs: { asc: "craft πρώτα", desc: "Titan Soul πρώτα" }, asc: true },
  };
  function sortEntries(es) {
    const col = ECOLS[UI.esort] || ECOLS.unlocks;
    const sign = UI.edir === "asc" ? 1 : -1;
    const idx = new Map(S.entries.map((e, i) => [e.key, i]));
    return es.sort((a, b) => {
      const x = col.val(a), y = col.val(b);
      return sign * (typeof x === "string" ? x.localeCompare(y, "el") : x - y) || idx.get(a.key) - idx.get(b.key);
    });
  }
  function sortTh(key, cls) {
    const col = ECOLS[key];
    const on = UI.esort === key;
    return h("th", { class: (cls ? cls + " " : "") + "bk-sortable" + (on ? " on" : ""), title: col.title || null,
      "aria-sort": on ? (UI.edir === "asc" ? "ascending" : "descending") : "none" },
    h("button", {
      type: "button", class: "bk-sort",
      onclick: () => {
        if (on) UI.edir = UI.edir === "asc" ? "desc" : "asc";
        else { UI.esort = key; UI.edir = col.asc ? "asc" : "desc"; }
        saveUI(); render();
      },
    }, col.head ? h("span", null, col.head[0], h("br"), h("small", null, col.head[1])) : col.label,
    h("span", { class: "bk-arrow", "aria-hidden": "true" }, on ? (UI.edir === "asc" ? "▲" : "▼") : "↕")));
  }
  // Power an entry unlocks: per group still waiting for it, the group's gain × its share of what the group misses;
  // per piece = that ÷ the pieces missing in groups. The Titan Soul goes one per use: «up to» the best next use.
  function powerCell(e, per) {
    if (!e.missingPieces) return h("span", { class: "muted" }, "—");
    if (e.upTo) return h("div", { title: "Το επόμενο της σειράς · όλα μαζί: " + signed(e.unlocksPowerAll) }, h("b", null, "έως " + signed(e.unlocksPower)), h("div", { class: "bk-hint" }, "ανά soul"));
    if (per) return h("div", null, h("b", null, signed(e.perPiece)), h("div", { class: "bk-hint" }, "÷ " + e.missingPieces + " σε upgrades"));
    return h("b", null, signed(e.unlocksPower));
  }
  function forText(e) {
    if (e.uses) {  // one line; the ranking folds out
      const open = e.uses.filter((u) => !u.covered);
      return h("details", { class: "bk-more" },
        h("summary", null, e.uses.length + " χρήσεις, 1 η καθεμία · " + (open.length ? "επόμενο: " + open[0].unit : "καλύπτονται όλα")),
        h("ol", { class: "bk-uses" }, e.uses.map((u) => h("li", { class: u.covered ? "ok" : "" }, u.unit + " " + signed(u.gain) + (u.covered ? " ✓" : "")))));
    }
    const units = [...new Set(e.for.map((f) => f.unit + (f.slot ? " s" + f.slot : "")))];
    const shown = units.slice(0, 4).join(", ") + (units.length > 4 ? " +" + (units.length - 4) : "");
    return h("div", null,
      units.length ? h("div", null, shown) : null,
      h("div", { class: "muted" }, [e.gain ? signed(e.gain) + " power" : null, e.reservedQty ? e.reservedQty + " για βήματα του πλάνου" : null,
        e.unplanned ? e.unplanned + " από το review χωρίς βήμα ακόμα" : null,
        e.unlocks && e.unlocks.length ? "βήματα " + e.unlocks.slice(0, 6).join(", ") + (e.unlocks.length > 6 ? "…" : "") : null].filter(Boolean).join(" · ")));
  }

  load();
})();
