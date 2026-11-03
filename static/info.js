/* Name links and their popup, on every page the server sends (server.py adds this script to each HTML file).
   Known game names in the page's text (items, spirits, elements, skills, item skills; GET /api/info-names) become
   links, longest name first and whole words only; a tap opens what the thing does (GET /api/info/<name>).
   A MutationObserver links what the pages render later; it pauses while it wraps, so its own changes are not seen.
   An extension marks a name itself with data-info="<base name>" on any element: a tap (or Enter) opens that name's
   popup whatever the element shows (a skill's tier name "Sonic Speed" under data-info="<its T1 name>": that tier is
   the one highlighted), and nothing inside it is scanned. data-info-kind="item|spirit|element|skill|itemSkill" picks
   one when the name is also something else; data-noinfo keeps a part of the page out; STInfo.open(name, kind) and
   STInfo.scan(element) do the same from code. */
(() => {
  "use strict";
  if (window.STInfo) return;

  const SKIP = "input,textarea,select,option,button,a,script,style,noscript,template,code,pre,svg,math," +
    "[contenteditable],[data-noinfo],[data-info],.sti-pop";
  const IS_WORD = /[\p{L}\p{N}'’]/u;
  const HAS_UPPER = /\p{Lu}/u;
  const OBSERVE = { childList: true, subtree: true, characterData: true };
  const STAT = { attack: "ATK", defense: "DEF", hp: "HP", evasion: "EVA", critical_chance: "Crit", mana_shield: "Mana Shield" };
  const PERCENT = new Set(["evasion", "critical_chance"]);
  const KIND = { item: "Item", spirit: "Spirit", element: "Element", skill: "Skill", itemSkill: "Skill του item", consumable: "Consumable" };
  const FRESH_MS = 60000; // the owner's storage can change while a page stays open

  let index = null; // first word of a name -> [{name, link}], longest first
  const seen = new WeakMap(); // text node -> the text it had when it was scanned
  const cache = new Map(); // name -> {at, promise}

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
      if (kid == null || kid === false || kid === "") continue;
      el.append(kid instanceof Node ? kid : String(kid));
    }
    return el;
  }

  function fill(el, ...kids) {
    el.replaceChildren(...kids.flat(Infinity).filter((k) => k != null && k !== false && k !== ""));
  }

  // --- finding names in text ------------------------------------------------------------------------

  function firstWord(s) {
    let i = 0;
    while (i < s.length && IS_WORD.test(s[i])) i++;
    return s.slice(0, i);
  }

  function buildIndex(names, stop) {
    const map = new Map();
    const add = (name, link) => {
      const w = firstWord(name);
      if (!w) return;
      if (!map.has(w)) map.set(w, []);
      map.get(w).push({ name, link });
    };
    names.forEach((n) => add(n, true));
    stop.forEach((n) => add(n, false)); // phrases that hold a shorter name and are not it ("Titan Soul")
    for (const list of map.values()) list.sort((a, b) => b.name.length - a.name.length);
    return map;
  }

  // [[start, end, name]] of the names in a text; a stop phrase eats its words without a link
  function findNames(text) {
    const s = text.replace(/[’ ]/g, (ch) => (ch === "’" ? "'" : " "));
    const hits = [];
    const n = s.length;
    let i = 0;
    while (i < n) {
      if (!IS_WORD.test(s[i]) || (i > 0 && IS_WORD.test(s[i - 1]))) { i++; continue; }
      let j = i;
      while (j < n && IS_WORD.test(s[j])) j++;
      const list = index.get(s.slice(i, j));
      let hit = null;
      if (list) {
        for (const c of list) {
          const end = i + c.name.length;
          if (s.startsWith(c.name, i) && (end >= n || !IS_WORD.test(s[end]))) { hit = c; break; }
        }
      }
      if (!hit) { i = j; continue; }
      if (hit.link) hits.push([i, i + hit.name.length, hit.name]);
      i += hit.name.length;
    }
    return hits;
  }

  function nameLink(name, text) {
    return h("span", { class: "st-info", "data-info": name, tabindex: "0", role: "button" }, text || name);
  }

  function plain(text) {
    const t = document.createTextNode(text);
    seen.set(t, text);
    return t;
  }

  function wrap(node, hits) {
    const s = node.data;
    const frag = document.createDocumentFragment();
    let at = 0;
    for (const [a, b, name] of hits) {
      if (a > at) frag.append(plain(s.slice(at, a)));
      frag.append(nameLink(name, s.slice(a, b)));
      at = b;
    }
    if (at < s.length) frag.append(plain(s.slice(at)));
    node.replaceWith(frag);
  }

  function scanText(t) {
    if (seen.get(t) === t.data) return;
    seen.set(t, t.data);
    if (t.data.length < 3 || !HAS_UPPER.test(t.data)) return;
    const hits = findNames(t.data);
    if (hits.length) wrap(t, hits);
  }

  function skipped(el) {
    return !el || el.closest(SKIP) !== null;
  }

  function scan(root) {
    if (!index || !root || !root.isConnected) return;
    if (root.nodeType === Node.TEXT_NODE) {
      if (!skipped(root.parentElement)) scanText(root);
      return;
    }
    if (root.nodeType !== Node.ELEMENT_NODE || skipped(root)) return;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, {
      acceptNode: (n) => (n.nodeType === Node.TEXT_NODE ? NodeFilter.FILTER_ACCEPT
        : n.matches(SKIP) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_SKIP),
    });
    const texts = [];
    while (walker.nextNode()) texts.push(walker.currentNode);
    texts.forEach(scanText);
  }

  // --- following the page's own re-renders ----------------------------------------------------------

  const pending = new Set();
  let timer = 0;
  const observer = new MutationObserver((records) => { take(records); schedule(); });

  function take(records) {
    for (const r of records) {
      if (r.type === "characterData") pending.add(r.target);
      else r.addedNodes.forEach((n) => pending.add(n));
    }
  }

  function schedule() {
    if (!timer) timer = setTimeout(flush, 30);
  }

  function flush() {
    timer = 0;
    take(observer.takeRecords());
    observer.disconnect(); // our own wraps are not page changes
    try {
      for (const n of pending) scan(n);
    } finally {
      pending.clear();
      observer.observe(document.body, OBSERVE);
    }
  }

  async function start() {
    try {
      const r = await fetch("/api/info-names");
      const j = await r.json();
      index = buildIndex(j.names || [], j.stop || []);
    } catch (e) {
      console.warn("info names did not load:", e);
      return;
    }
    pending.add(document.body);
    flush();
  }

  // --- the popup ------------------------------------------------------------------------------------

  let dlg = null;
  let stack = []; // names opened inside the popup, for «Πίσω»

  function popup() {
    if (dlg) return dlg;
    dlg = h("dialog", { class: "sti-pop", "aria-labelledby": "sti-title" },
      h("div", { class: "sti-inner" },
        h("div", { class: "sti-head" },
          h("button", { class: "sti-btn sti-back", type: "button", "aria-label": "Πίσω", title: "Πίσω", hidden: true, onclick: back }, "←"),
          h("span", { class: "sti-icon" }),
          h("div", { class: "sti-titles" }, h("h2", { id: "sti-title" }), h("div", { class: "sti-sub" })),
          h("button", { class: "sti-btn", type: "button", "aria-label": "Κλείσιμο", title: "Κλείσιμο", onclick: () => dlg.close() }, "✕")),
        h("div", { class: "sti-body" })));
    dlg.addEventListener("click", (e) => { if (e.target === dlg) dlg.close(); }); // outside the box
    dlg.addEventListener("close", () => { stack = []; });
    document.body.append(dlg);
    return dlg;
  }

  // hint: the text the tapped element shows, e.g. the tier name of a skill marked with its T1 name
  function open(name, inside, kind, hint) {
    if (!name) return;
    const d = popup();
    const ask = { name, kind: kind || null, hint: hint || null };
    if (inside && d.open) stack.push(ask);
    else stack = [ask];
    show(ask);
    if (!d.open) d.showModal();
  }

  function back() {
    if (stack.length < 2) return;
    stack.pop();
    show(stack[stack.length - 1]);
  }

  function get(ask) {
    const key = ask.name + "|" + (ask.kind || "");
    const hit = cache.get(key);
    if (hit && Date.now() - hit.at < FRESH_MS) return hit.promise;
    const url = "/api/info/" + encodeURIComponent(ask.name) + (ask.kind ? "?kind=" + encodeURIComponent(ask.kind) : "");
    const promise = fetch(url).then(async (r) => {
      const j = await r.json().catch(() => ({}));
      if (!r.ok && r.status !== 404) throw new Error(j.error || "HTTP " + r.status);
      return j;
    });
    promise.catch(() => cache.delete(key));
    cache.set(key, { at: Date.now(), promise });
    return promise;
  }

  function setHead(title, icon, sub) {
    const d = popup();
    d.querySelector("#sti-title").textContent = title;
    d.querySelector(".sti-sub").textContent = sub || "";
    d.querySelector(".sti-icon").replaceChildren(icon ? h("img", { src: icon, alt: "", loading: "lazy" }) : "");
    d.querySelector(".sti-back").hidden = stack.length < 2;
  }

  async function show(ask) {
    const body = popup().querySelector(".sti-body");
    setHead(ask.name, null, "");
    body.replaceChildren(h("p", { class: "sti-muted" }, "Φόρτωση…"));
    let data;
    try {
      data = await get(ask);
    } catch (e) {
      if (stack[stack.length - 1] === ask) body.replaceChildren(h("p", { class: "sti-bad" }, "Δεν φορτώθηκε: " + e.message));
      return;
    }
    if (stack[stack.length - 1] !== ask) return; // another name was opened meanwhile
    if (!data.entries) {
      const sug = data.suggestions || [];
      fill(body, h("p", {}, "Δεν το βρήκα στα δεδομένα."),
        sug.length > 0 && h("p", {}, "Μήπως: ", sep(sug.map((s) => nameLink(s)))));
      return;
    }
    const first = data.entries[0];
    const many = data.entries.length > 1;
    setHead(many ? data.name : first.name, (data.entries.find((e) => e.icon) || {}).icon, many ? "" : subtitle(first));
    fill(body,
      data.matchedBy !== "exact" && h("p", { class: "sti-muted" }, `Για «${data.query}»`),
      many && h("p", { class: "sti-muted" }, `Το «${data.name}» είναι ${data.entries.length} πράγματα:`),
      data.entries.map((e) => h("section", { class: "sti-sec" },
        many && h("h3", {}, h("span", { class: "sti-kind" }, KIND[e.kind] || e.kind), e.name,
          h("span", { class: "sti-muted" }, " · " + subtitle(e))),
        render(e, ask.hint))));
  }

  // --- what each kind shows -------------------------------------------------------------------------

  function num(v) {
    if (v == null || v === "") return "—";
    if (typeof v !== "number") return String(v);
    return new Intl.NumberFormat("el-GR", { maximumFractionDigits: Number.isInteger(v) ? 0 : 2 }).format(v);
  }

  function statText(stats) {
    return Object.entries(stats || {}).map(([k, v]) => `${STAT[k] || k} ${num(v)}${PERCENT.has(k) ? "%" : ""}`).join(" · ") || "—";
  }

  function sep(nodes, by) {
    const out = [];
    nodes.forEach((n, i) => { if (i) out.push(by || ", "); out.push(n); });
    return out;
  }

  function chip(icon, text) {
    return h("span", { class: "sti-chip" }, icon && h("img", { src: icon, alt: "" }), text);
  }

  function rows(list) {
    return h("dl", { class: "sti-rows" }, list.filter(Boolean).map(([k, v]) => [h("dt", {}, k), h("dd", {}, v)]));
  }

  function subtitle(e) {
    if (e.kind === "item") return [e.tier != null && "T" + e.tier, [e.type].concat(e.subTypes || []).join(" / ")].filter(Boolean).join(" · ");
    if (e.kind === "spirit") return `T${e.tier} · Spirit`;
    if (e.kind === "element") return `T${e.tier} · ${e.element ? e.element.name + " " : ""}element`;
    if (e.kind === "skill") return `${e.rarity || ""} skill${e.innate ? " · innate" : ""}`.trim();
    if (e.kind === "consumable") return "Consumable";
    return "Skill που έχει το ίδιο το item";
  }

  function howText(how) {
    if (!how) return "—";
    return [h("strong", {}, how.label), how.detail && h("div", { class: "sti-muted" }, how.detail)];
  }

  function blueprintText(bp) {
    if (!bp) return "—";
    if (bp.state === "unlocked") return [h("span", { class: "sti-ok" }, "✓ Το έχεις"), bp.crafted ? ` · φτιαγμένο ${num(bp.crafted)} φορές` : ""];
    if (bp.state === "locked") return [h("span", { class: "sti-bad" }, "✗ Δεν το έχεις"), bp.how && h("div", { class: "sti-muted" }, bp.how)];
    return h("span", { class: "sti-muted" }, "Άγνωστο: " + bp.why);
  }

  function storedText(owned) {
    const list = owned.stored || [];
    if (!list.length) return h("span", { class: "sti-muted" }, "Κανένα Epic ή Legendary");
    return list.map((s) => h("div", {},
      h("strong", { class: "sti-q-" + s.quality }, (s.count == null ? "≥1" : num(s.count)) + " × " + s.quality),
      (s.element || s.spirit) && [" με ", sep([s.element, s.spirit].filter(Boolean).map((n) => nameLink(n)), " + ")]));
  }

  function cardsText(owned) {
    if (!owned.cards || !owned.cards.length) return h("span", { class: "sti-muted" }, "Καμία κάρτα");
    return [sep(owned.cards.map((c) => h("span", { class: "sti-q-" + c.quality }, `${c.quality} ${num(c.count)}`)), " · "),
      owned.cards.length > 1 && h("span", { class: "sti-muted" }, ` · σύνολο ${num(owned.total)}`)];
  }

  function wornText(worn) {
    const chips = worn.map((w) => h("a", {
      class: "sti-chip", href: `/#${w.kind}/${encodeURIComponent(w.unit)}`, onclick: () => popup().close(),
    }, w.unit, h("span", { class: "sti-muted" }, ` · slot ${w.slots.join(", ")}${w.qualities.length ? " · " + w.qualities.join("/") : ""}`)));
    const box = h("div", { class: "sti-chips" }, chips.slice(0, 6));
    if (chips.length > 6) {
      box.append(h("button", { class: "sti-chip sti-more", type: "button", onclick: (e) => { e.currentTarget.replaceWith(...chips.slice(6)); } },
        `+${chips.length - 6} ακόμα`));
    }
    return box;
  }

  function footer(e) {
    return h("div", { class: "sti-foot" },
      e.official && h("a", { href: e.official, target: "_blank", rel: "noopener noreferrer" }, "Επίσημη σελίδα ↗"),
      e.releaseAt && h("span", { class: "sti-muted" }, "Κυκλοφόρησε " + new Date(e.releaseAt).toLocaleDateString("el-GR")));
  }

  function qualityTable(e) {
    if (!e.byQuality || !e.byQuality.length) return null;
    const keys = Object.keys(e.byQuality[0].stats);
    return h("div", { class: "sti-scroll" }, h("table", { class: "sti-table" },
      h("thead", {}, h("tr", {}, h("th", {}, "Quality"), keys.map((k) => h("th", { class: "num" }, STAT[k] || k)))),
      h("tbody", {}, e.byQuality.map((q) => h("tr", { class: "sti-row-" + q.quality },
        h("td", {}, h("span", { class: "sti-q-" + q.quality }, q.quality), h("span", { class: "sti-muted" }, " ×" + num(q.mult))),
        keys.map((k) => h("td", { class: "num" }, num(q.stats[k]))))))));
  }

  function renderItem(e) {
    const flat = Object.keys(e.flat || {});
    const aff = e.affinity.elements.map((x) => chip(x.icon, x.name));
    if (e.affinity.spirit) aff.push(nameLink(e.affinity.spirit));
    const innate = [e.innate.element, e.innate.spirit].filter(Boolean);
    return [
      qualityTable(e),
      rows([
        !e.byQuality.length && ["Stats", statText(e.stats)],
        flat.length > 0 && ["Επιπλέον", [statText(e.flat), flat.every((k) => PERCENT.has(k)) ? h("span", { class: "sti-muted" }, " (ίδιο σε κάθε quality)") : ""]],
        ["Affinity", aff.length ? sep(aff, " ") : h("span", { class: "sti-muted" }, "καμία")],
        innate.length > 0 && ["Ενσωματωμένο", sep(innate.map((n) => nameLink(n)))],
        e.skill && ["Skill του item", [h("strong", {}, e.skill.name), e.skill.effect ? ": " + e.skill.effect : ""]],
        e.starforge && ["Starforge", "base stats ×" + e.starforge],
        e.transcendence.length > 0 && ["Transcendence", e.transcendence.join(" · ")],
        ["Πώς το παίρνεις", howText(e.how)],
        ["Blueprint", blueprintText(e.blueprint)],
        ["Στην αποθήκη", storedText(e.owned)],
        e.owned.worn.length > 0 && ["Το φοράνε", wornText(e.owned.worn)],
      ]),
      footer(e),
    ];
  }

  function renderSpirit(e) {
    return [
      rows([
        ["Effect", h("strong", {}, e.effect || "—")],
        e.effectWithAffinity && ["Με affinity", e.effectWithAffinity],
        ["Stats", statText(e.stats)],
        e.affinityItems.length > 0 && ["Items με affinity", sep(e.affinityItems.map((n) => nameLink(n)))],
        ["Πώς το παίρνεις", howText(e.how)],
        ["Στην αποθήκη", cardsText(e.owned)],
        e.owned.worn.length > 0 && ["Το φοράνε", wornText(e.owned.worn)],
      ]),
      footer(e),
    ];
  }

  function renderElement(e) {
    return [
      rows([
        ["Element", [e.element ? chip(e.element.icon, e.element.name) : "—", e.amount != null ? ` +${e.amount} element` : ""]],
        ["Stats", statText(e.stats)],
        ["Πώς το παίρνεις", howText(e.how)],
        ["Στην αποθήκη", cardsText(e.owned)],
        e.owned.worn.length > 0 && ["Το φοράνε", wornText(e.owned.worn)],
      ]),
      footer(e),
    ];
  }

  function renderSkill(e, hint) {
    // the tier the page showed: the longest tier name inside the tapped text, else the name asked for
    const shown = e.tiers.map((t) => t.name).filter((n) => hint && hint.includes(n)).sort((a, b) => b.length - a.length)[0];
    const here = shown || e.matched;
    return [
      rows([
        ["Rarity", e.rarity || "—"],
        ["Classes", e.classesText || e.classes.join(", ") || "—"],
      ]),
      h("div", { class: "sti-scroll" }, h("table", { class: "sti-table sti-tiers" },
        h("thead", {}, h("tr", {}, h("th", {}, "Tier"), h("th", {}, "Element"), h("th", {}, "Τι κάνει"))),
        h("tbody", {}, e.tiers.map((t) => h("tr", { class: t.name === here ? "sti-here" : null },
          h("td", {}, h("strong", {}, "T" + t.tier), " ", t.name),
          h("td", { class: "num" }, t.element ? "" + t.element : "—", t.promotion ? h("div", { class: "sti-muted" }, "+ promotion") : ""),
          h("td", {}, t.description || "—")))))),
    ];
  }

  function renderItemSkill(e) {
    return rows([
      ["Τι κάνει", h("strong", {}, e.effect || "—")],
      e.items.length > 0 && ["Το έχουν", sep(e.items.map((n) => nameLink(n)))],
    ]);
  }

  function renderConsumable(e) {
    const WHAT = { promotion: "promotion", titanSoul: "Upgrade Class" };
    return rows([
      ["Τι κάνει", e.text ? h("strong", {}, e.text) : h("span", { class: "sti-muted" }, "Δεν το έχουμε στα δεδομένα")],
      ["Στην αποθήκη", e.count == null ? h("span", { class: "sti-muted" }, "δεν διαβάστηκε") : h("strong", {}, num(e.count))],
      e.needed && ["Το θέλει το bucket", [h("strong", {}, num(e.needed)),
        e.count != null && e.needed > e.count ? h("span", { class: "sti-muted" }, ` · λείπουν ${num(e.needed - e.count)}`) : "",
        h("div", { class: "sti-chips" }, e.for.map((f) => h("a", {
          class: "sti-chip", href: `/#${f.kind}/${encodeURIComponent(f.unit)}`, onclick: () => popup().close(),
        }, f.unit, h("span", { class: "sti-muted" }, ` · ${WHAT[f.what] || f.what || ""}${f.gain ? " +" + num(f.gain) : ""}`))))]],
    ]);
  }

  function render(e, hint) {
    if (e.kind === "consumable") return renderConsumable(e);
    if (e.kind === "item") return renderItem(e);
    if (e.kind === "spirit") return renderSpirit(e);
    if (e.kind === "element") return renderElement(e);
    if (e.kind === "skill") return renderSkill(e, hint);
    return renderItemSkill(e);
  }

  // --- taps and keys --------------------------------------------------------------------------------

  function openFrom(t) {
    open(t.getAttribute("data-info"), !!t.closest(".sti-pop"), t.getAttribute("data-info-kind"), t.textContent.trim());
  }

  document.addEventListener("click", (e) => {
    const t = e.target instanceof Element ? e.target.closest("[data-info]") : null;
    if (!t) return;
    e.preventDefault();
    e.stopPropagation(); // a name inside a clickable row opens its popup, not the row
    openFrom(t);
  }, true);

  document.addEventListener("keydown", (e) => {
    if (e.key !== "Enter" && e.key !== " ") return;
    const t = e.target instanceof Element ? e.target.closest("[data-info]") : null;
    // a native button or link turns the key into a click by itself
    if (!t || t !== e.target || t.matches("button, a[href], summary, input, select, textarea")) return;
    e.preventDefault();
    e.stopPropagation();
    openFrom(t);
  }, true);

  window.STInfo = { open: (name, kind) => open(name, false, kind), scan };
  if (document.body) start();
  else document.addEventListener("DOMContentLoaded", start);
})();
