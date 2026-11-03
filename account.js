// The account page: the player's heroes (6 slots, skills), storage, blueprints, import / export, and the button
// that runs the review. Every change is written as a data/roster file (data/roster/SCHEMA.md) through STAccount.
(function () {
  "use strict";
  const A = window.STAccount;
  const root = document.getElementById("acct");
  let cat, files, heroes, inventory, blueprints, editing = null, dirty = false;

  // ------------------------------------------------------------ helpers
  function h(tag, attrs, ...kids) {
    const n = document.createElement(tag);
    Object.entries(attrs || {}).forEach(([k, v]) => {
      if (v == null || v === false) return;
      if (k.startsWith("on")) n.addEventListener(k.slice(2), v);
      else if (k === "value") n.value = v;
      else n.setAttribute(k, v === true ? "" : v);
    });
    kids.flat().forEach((k) => k != null && k !== false && n.append(k.nodeType ? k : String(k)));
    return n;
  }
  const list = (id, values) => h("datalist", { id }, values.map((v) => h("option", { value: v })));
  const parse = (text, fallback) => { try { return JSON.parse(text); } catch (e) { return fallback; } };
  const now = () => new Date().toISOString().replace(/\.\d+Z$/, "+00:00");
  const heroPath = (name) => `data/roster/heroes/${name}.json`;
  const safeName = (s) => s.trim().replace(/[\/\\]/g, "-").replace(/^\.+/, "");

  function load(f) {
    files = f;
    heroes = {};
    Object.entries(files).forEach(([rel, text]) => {
      if (rel.startsWith("data/roster/heroes/")) {
        const doc = parse(text, null);
        if (doc) heroes[doc.hero || rel.slice(19, -5)] = doc;
      }
    });
    inventory = parse(files["data/roster/inventory.json"], null) || { items: [], enchants: [], consumables: [] };
    inventory.items = inventory.items || [];
    inventory.enchants = inventory.enchants || [];
    inventory.consumables = inventory.consumables || [];
    blueprints = parse(files["data/roster/blueprints.json"], null) || { unlocked: [], byType: {} };
    blueprints.unlocked = blueprints.unlocked || [];
  }

  function changed() { dirty = true; render(); }

  // ------------------------------------------------------------ catalogue lookups
  const cls = (name) => cat.classes.find((c) => c.name === name);
  const itemByName = new Map();
  function itemsFor(types) { return cat.items.filter((it) => types.includes(it.type)).sort((a, b) => b.tier - a.tier || a.name.localeCompare(b.name)); }
  function skillsFor(c) {
    if (!c) return cat.skills;
    const names = new Set([c.name, c.baseClass, c.promotesTo].filter(Boolean));
    return cat.skills.filter((s) => s.classes.some((x) => names.has(x)));
  }

  // ------------------------------------------------------------ sections
  function intro() {
    const u = A.user();
    const n = Object.keys(heroes).length;
    return h("section", { class: "card" },
      h("h1", {}, "Ο λογαριασμός μου"),
      h("p", { class: "muted" }, u.mode === "local"
        ? "Χωρίς σύνδεση: τα δεδομένα μένουν μόνο σε αυτόν τον browser. Με «Σύνδεση» (πάνω δεξιά) τα βλέπεις από κάθε συσκευή."
        : `Συνδεδεμένος ως ${u.name}. Τα δεδομένα σου τα βλέπεις μόνο εσύ, από κάθε συσκευή.`),
      h("ol", { class: "steps" },
        h("li", {}, "Βάλε τους ήρωές σου: class, level, skills και τα 6 slots (item, quality, element, spirit)."),
        h("li", {}, "Στην «Αποθήκη» βάλε ό,τι Epic/Legendary items και enchants έχεις, και τα Titan Soul / dice."),
        h("li", {}, "Στα «Blueprints» βάλε όσα έχεις ξεκλειδώσει (για να σου λέει «craft it yourself»)."),
        h("li", {}, "Πάτα «Υπολογισμός». Μετά δες «Ήρωες» (review ανά slot), «Ομάδα» και «Bucket list» (τι λείπει από το ιδανικό build).")),
      h("div", { class: "actions" },
        h("button", { class: "primary", onclick: recompute, disabled: n ? null : true }, `Υπολογισμός (${n} ήρωες)`),
        h("button", { onclick: () => importInput.click() }, "Εισαγωγή αρχείων"),
        h("button", { onclick: exportAll }, "Εξαγωγή (αρχείο)"),
        n ? h("button", { class: "danger", onclick: wipe }, "Σβήσε τα πάντα") : null));
  }

  function banner() {
    if (!dirty) return null;
    return h("div", { class: "banner" }, h("span", { class: "grow" }, "Άλλαξαν δεδομένα: πάτα «Υπολογισμός» για νέο review και bucket list."),
      h("button", { class: "primary", onclick: recompute }, "Υπολογισμός"));
  }

  function heroList() {
    const names = Object.keys(heroes).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    return h("section", { class: "card" },
      h("h2", {}, "Ήρωες", h("span", { class: "muted" }, `(${names.length})`), h("span", { class: "grow" }),
        h("button", { class: "primary", onclick: () => { editing = blankHero(); render(); } }, "+ Νέος ήρωας")),
      editing ? editor() : null,
      names.length ? h("div", { class: "heroes" }, names.map((n) => {
        const d = heroes[n];
        const gear = (d.slots || []).filter((s) => s.item).map((s) => `${s.item}${s.quality && s.quality !== "Epic" ? " (" + s.quality + ")" : ""}`).join(" · ");
        return h("div", { class: "hero-row" },
          h("span", { class: "name" }, n), h("span", {}, `${d.class || "?"} · L${d.level || "?"}`),
          h("span", { class: "gear" }, gear || "χωρίς gear"),
          h("button", { class: "small", onclick: () => { editing = JSON.parse(JSON.stringify(d)); editing._was = n; render(); } }, "Αλλαγή"),
          h("button", { class: "small danger", onclick: () => delHero(n) }, "Διαγραφή"));
      })) : h("p", { class: "muted" }, "Κανένας ήρωας ακόμα."));
  }

  function blankHero() {
    return { hero: "", class: "", level: 40, promoted: false, seeds: null, cardLevel: null, skills: [], elementShown: null,
             stats: { power: null }, slots: [1, 2, 3, 4, 5, 6].map((n) => ({ slot: n, empty: true })), source: "site" };
  }

  function editor() {
    const e = editing;
    const c = cls(e.class);
    const errs = [];
    const field = (label, input) => h("label", { class: "f" }, label, input);
    const classSel = h("select", { onchange: (ev) => { e.class = ev.target.value; e.promoted = !!(cls(e.class) || {}).promoted; render(); } },
      h("option", { value: "" }, "— διάλεξε —"),
      ["Fighter", "Rogue", "Spellcaster"].map((type) => h("optgroup", { label: type },
        cat.classes.filter((x) => x.type === type).map((x) => h("option", { value: x.name, selected: x.name === e.class }, x.name)))));
    const skillNames = skillsFor(c).flatMap((s) => [s.name, ...s.tiers.slice(1)]);
    const top = h("div", { class: "grid" },
      field("Όνομα ήρωα", h("input", { value: e.hero, placeholder: "όπως στο παιχνίδι", oninput: (ev) => { e.hero = ev.target.value; } })),
      field("Class", classSel),
      field("Level", h("input", { type: "number", min: 1, max: 60, value: e.level, oninput: (ev) => { e.level = +ev.target.value || null; } })),
      field("Element (όπως δείχνει, προαιρετικό)", h("input", { type: "number", min: 0, value: e.elementShown, oninput: (ev) => { e.elementShown = ev.target.value === "" ? null : +ev.target.value; } })),
      field("Card level (Card Collection, προαιρετικό)", h("input", { type: "number", min: 0, max: 10, value: e.cardLevel, oninput: (ev) => { e.cardLevel = ev.target.value === "" ? null : +ev.target.value; } })),
      field("Power (όπως το δείχνει το παιχνίδι)", h("input", { type: "number", min: 0, value: (e.stats || {}).power, oninput: (ev) => { e.stats = Object.assign({}, e.stats, { power: ev.target.value === "" ? null : +ev.target.value }); } })));
    const skills = h("div", { class: "skills" }, list("sk-list", skillNames), [0, 1, 2, 3].map((i) => {
      const v = (e.skills || [])[i] || "";
      const known = !v || skillNames.includes(v) || cat.skills.some((s) => s.tiers.includes(v));
      if (!known) errs.push(`άγνωστο skill «${v}»`);
      return field(`Skill ${i + 1}`, h("input", { list: "sk-list", value: v, class: known ? null : "bad", placeholder: "όνομα skill",
        onchange: (ev) => { e.skills = e.skills || []; e.skills[i] = ev.target.value.trim(); e.skills = e.skills.filter((x, j) => x || j < 4); render(); } }));
    }));
    const slots = h("div", { class: "slots" },
      list("el-list", cat.elements), list("sp-list", cat.spirits),
      (e.slots || []).map((s, i) => {
        const types = c ? c.slots[String(s.slot)] || [] : [];
        const its = itemsFor(types);
        its.forEach((it) => itemByName.set(it.name, it));
        const id = `it-${s.slot}`;
        const okItem = !s.item || its.some((it) => it.name === s.item);
        const okEl = !s.element || cat.elements.includes(s.element);
        const okSp = !s.spirit || cat.spirits.includes(s.spirit);
        if (!okItem) errs.push(`slot ${s.slot}: το «${s.item}» δεν μπαίνει εδώ (${types.join("/") || "διάλεξε class"})`);
        if (!okEl) errs.push(`slot ${s.slot}: άγνωστο element «${s.element}»`);
        if (!okSp) errs.push(`slot ${s.slot}: άγνωστο spirit «${s.spirit}»`);
        const set = (k) => (ev) => {
          const v = ev.target.value.trim() || null;
          const next = Object.assign({}, s, { [k]: v });
          delete next.empty;
          if (!next.item) { e.slots[i] = { slot: s.slot, empty: true }; } else {
            const it = itemByName.get(next.item);
            next.quality = next.quality || "Epic";
            if (it) { next.tier = it.tier; next.type = it.type; }
            e.slots[i] = next;
          }
          render();
        };
        return h("div", { class: "slot" },
          h("span", { class: "lbl" }, `Slot ${s.slot}`, h("br"), types.join(" / ") || "—"),
          list(id, its.map((it) => it.name)),
          h("input", { list: id, value: s.item || "", class: okItem ? null : "bad", placeholder: "item (κενό = άδειο)", onchange: set("item") }),
          h("select", { onchange: set("quality"), disabled: s.item ? null : true },
            cat.qualities.map((q) => h("option", { value: q, selected: (s.quality || "Epic") === q }, q))),
          h("input", { class: "el" + (okEl ? "" : " bad"), list: "el-list", value: s.element || "", placeholder: "element", onchange: set("element"), disabled: s.item ? null : true }),
          h("input", { class: "sp" + (okSp ? "" : " bad"), list: "sp-list", value: s.spirit || "", placeholder: "spirit", onchange: set("spirit"), disabled: s.item ? null : true }));
      }));
    if (!e.hero.trim()) errs.push("βάλε όνομα");
    if (!c) errs.push("διάλεξε class");
    return h("div", { class: "card", style: "background:var(--card-2)" },
      h("h2", {}, e._was ? `Αλλαγή: ${e._was}` : "Νέος ήρωας"),
      top, skills, slots,
      errs.length ? h("p", { class: "err" }, errs.join(" · ")) : null,
      h("div", { class: "actions" },
        h("button", { class: "primary", onclick: saveHero }, "Αποθήκευση"),
        h("button", { onclick: () => { editing = null; render(); } }, "Άκυρο")));
  }

  function validate(e) {
    const c = cls(e.class);
    const errs = [];
    if (!(e.hero || "").trim()) errs.push("βάλε όνομα");
    if (!c) errs.push("διάλεξε class");
    if (!((e.stats || {}).power > 0)) errs.push("βάλε το power του ήρωα");
    (e.slots || []).forEach((s) => {
      const types = c ? c.slots[String(s.slot)] || [] : [];
      if (s.item && !cat.items.some((it) => it.name === s.item && types.includes(it.type))) errs.push(`slot ${s.slot}: «${s.item}»`);
      if (s.element && !cat.elements.includes(s.element)) errs.push(`slot ${s.slot}: element «${s.element}»`);
      if (s.spirit && !cat.spirits.includes(s.spirit)) errs.push(`slot ${s.slot}: spirit «${s.spirit}»`);
    });
    return errs;
  }

  async function saveHero() {
    const e = editing;
    const errs = validate(e);
    if (errs.length) { alert("Διόρθωσε πρώτα: " + errs.join(" · ")); render(); return; }
    const name = safeName(e.hero);
    const doc = Object.assign({}, e, { hero: name, capturedAt: now(), source: e.source || "site" });
    delete doc._was;
    doc.skills = (doc.skills || []).filter(Boolean);
    if (e._was && e._was !== name) { await A.put(heroPath(e._was), null); delete heroes[e._was]; }
    await A.put(heroPath(name), JSON.stringify(doc, null, 1));
    heroes[name] = doc;
    editing = null;
    changed();
  }

  async function delHero(name) {
    if (!confirm(`Διαγραφή του «${name}»;`)) return;
    await A.put(heroPath(name), null);
    delete heroes[name];
    changed();
  }

  function saveInventory() {
    inventory.capturedAt = now();
    A.put("data/roster/inventory.json", JSON.stringify(inventory, null, 1));
    dirty = true;
  }

  function storage() {
    const allItems = cat.items.filter((it) => it.tier >= 10).map((it) => it.name);
    const row = (arr, i, nameList, render2) => {
      const r = arr[i];
      return h("tr", {},
        h("td", {}, h("input", { list: nameList, value: r.item || "", onchange: (ev) => { r.item = ev.target.value.trim(); const it = cat.items.find((x) => x.name === r.item); if (it) { r.tier = it.tier; r.type = it.type; } saveInventory(); } })),
        h("td", {}, h("select", { onchange: (ev) => { r.quality = ev.target.value; saveInventory(); } },
          cat.qualities.map((q) => h("option", { value: q, selected: (r.quality || "Epic") === q }, q)))),
        h("td", { class: "n" }, h("input", { type: "number", min: 0, value: r.count || 0, onchange: (ev) => { r.count = +ev.target.value || 0; saveInventory(); } })),
        h("td", {}, h("button", { class: "small danger", onclick: () => { arr.splice(i, 1); saveInventory(); render2(); } }, "✕")));
    };
    const table = (title, arr, nameList, hint) => h("div", {},
      h("h3", {}, title), h("p", { class: "muted" }, hint),
      h("table", {}, h("tr", {}, h("th", {}, "Όνομα"), h("th", {}, "Quality"), h("th", {}, "Πόσα"), h("th", {})),
        arr.map((_, i) => row(arr, i, nameList, render))),
      h("div", { class: "actions" }, h("button", { class: "small", onclick: () => { arr.push({ item: "", quality: "Epic", count: 1 }); render(); } }, "+ Γραμμή")));
    const have = (name) => (inventory.consumables.find((c) => c.name === name) || {}).count || 0;
    const setHave = (name, v) => {
      let c = inventory.consumables.find((x) => x.name === name);
      if (!c) { c = { name, count: 0, hero: true }; inventory.consumables.push(c); }
      c.count = v;
      saveInventory();
    };
    return h("section", { class: "card" },
      h("h2", {}, "Αποθήκη"),
      list("inv-items", allItems), list("inv-ench", [...cat.elements, ...cat.spirits]),
      table("Items (μόνο Epic / Legendary)", inventory.items, "inv-items", "Ό,τι έχεις στην αποθήκη και θα μπορούσε να φορέσει κάποιος ήρωας."),
      table("Enchants (elements, spirits)", inventory.enchants, "inv-ench", "Μια γραμμή ανά κάρτα: το ίδιο enchant σε άλλη quality είναι άλλη γραμμή."),
      h("h3", {}, "Consumables"),
      h("div", { class: "grid" }, cat.consumables.map((n) => h("label", { class: "f" }, n,
        h("input", { type: "number", min: 0, value: have(n), onchange: (ev) => setHave(n, +ev.target.value || 0) })))),
      h("div", { class: "grid", style: "margin-top:10px" }, h("label", { class: "f" }, "Gems",
        h("input", { type: "number", min: 0, value: inventory.gems == null ? "" : inventory.gems,
                     onchange: (ev) => { inventory.gems = ev.target.value === "" ? null : +ev.target.value; saveInventory(); } }))));
  }

  function bps() {
    const names = cat.items.map((it) => it.name);
    let input;
    const add = () => {
      const v = input.value.trim();
      if (!names.includes(v) || blueprints.unlocked.includes(v)) { input.classList.add("bad"); return; }
      blueprints.unlocked.push(v);
      saveBlueprints();
      render();
    };
    input = h("input", { list: "bp-list", placeholder: "όνομα item", onkeydown: (ev) => { if (ev.key === "Enter") add(); } });
    return h("section", { class: "card" },
      h("h2", {}, "Blueprints", h("span", { class: "muted" }, `(${blueprints.unlocked.length})`)),
      h("p", { class: "muted" }, "Όσα έχεις ξεκλειδώσει από τα items που σε ενδιαφέρουν (T13+). Ό,τι δεν είναι εδώ, το site το προτείνει από το Market."),
      list("bp-list", names),
      h("div", { class: "actions" }, input, h("button", { onclick: add }, "Προσθήκη")),
      h("div", { class: "chips" }, blueprints.unlocked.slice().sort().map((n) => h("span", { class: "chip" }, n,
        h("button", { "aria-label": "Αφαίρεση " + n, onclick: () => { blueprints.unlocked = blueprints.unlocked.filter((x) => x !== n); saveBlueprints(); render(); } }, "✕")))));
  }

  function saveBlueprints() {
    blueprints.capturedAt = now();
    blueprints.source = "site";
    A.put("data/roster/blueprints.json", JSON.stringify(blueprints, null, 1));
    dirty = true;
  }

  // ------------------------------------------------------------ actions
  async function recompute() {
    await A.flush();
    const r = await A.recompute();
    dirty = false;
    root.prepend(h("div", { class: "banner" + (r.ok ? " ok" : "") },
      h("span", { class: "grow" }, r.ok ? `Έτοιμο: review για ${r.heroes} ήρωες.` : "Δεν βγήκε: " + r.error),
      r.ok ? h("a", { class: "btn", href: "/" }, "Ήρωες") : null, r.ok ? h("a", { class: "btn", href: "/ext/bucket.html" }, "Bucket list") : null));
  }

  function exportAll() {
    A.files().then((f) => {
      const blob = new Blob([JSON.stringify({ format: "shoptitans-account/1", exportedAt: now(), files: f }, null, 1)], { type: "application/json" });
      const a = h("a", { href: URL.createObjectURL(blob), download: "shoptitans-account.json" });
      document.body.append(a);
      a.click();
      a.remove();
    });
  }

  async function wipe() {
    if (!confirm("Να σβηστούν όλοι οι ήρωες, η αποθήκη και τα blueprints; (κάνε πρώτα «Εξαγωγή» αν θες αντίγραφο)")) return;
    await A.replaceAll({});
    load(await A.files());
    dirty = false;
    render();
  }

  // data/roster files from the phone reader (the project's tools/roster) or an export of this page
  const importInput = h("input", { type: "file", multiple: true, accept: ".json,application/json", hidden: true, onchange: async (ev) => {
    const out = [], skipped = [];
    for (const f of ev.target.files) {
      const doc = parse(await f.text(), null);
      if (!doc) { skipped.push(f.name); continue; }
      if (doc.format === "shoptitans-account/1" && doc.files) {
        if (!confirm(`Το «${f.name}» αντικαθιστά όλο τον λογαριασμό. Συνέχεια;`)) continue;
        await A.replaceAll(doc.files);
        out.push(f.name);
        continue;
      }
      let rel = null;
      if (doc.hero && doc.slots) rel = heroPath(safeName(doc.hero));
      else if (doc.champion) rel = `data/roster/champions/${safeName(doc.champion)}.json`;
      else if (doc.enchants || doc.consumables) rel = "data/roster/inventory.json";
      else if (doc.unlocked) rel = "data/roster/blueprints.json";
      else if (doc.byBaseClass) rel = "data/roster/hero_cards.json";
      if (!rel) { skipped.push(f.name); continue; }
      await A.put(rel, JSON.stringify(doc));
      out.push(f.name);
    }
    ev.target.value = "";
    load(await A.files());
    dirty = dirty || out.length > 0;
    render();
    alert(`Μπήκαν ${out.length} αρχεία.` + (skipped.length ? `\nΔεν αναγνωρίστηκαν: ${skipped.join(", ")}` : ""));
  } });

  function render() {
    const y = window.scrollY;
    root.replaceChildren(banner() || "", intro(), heroList(), storage(), bps(), importInput);
    window.scrollTo(0, y);
  }

  (async () => {
    await A.ready;
    cat = await A.call("catalog");
    load(await A.files());
    render();
  })().catch((err) => { root.replaceChildren(h("p", { class: "err" }, "Σφάλμα: " + err.message)); });
})();
