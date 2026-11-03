// The account page: the player's heroes (6 slots, skills), storage, blueprints, import / export, and the button
// that runs the review. Every change is written as a data/roster file (data/roster/SCHEMA.md) through STAccount.
// English only, with a hint under every field: the guild players meet the tool here first.
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
  const hint = (text) => h("span", { class: "hint" }, text);

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
      h("h1", {}, "My account"),
      h("p", { class: "muted" }, u.mode === "local"
        ? "Not signed in: your data stays in this browser only. Sign in with Discord (top right) to see it on every device."
        : `Signed in as ${u.name}. Only you can see your data, from any device.`),
      h("h3", {}, "How it works"),
      h("ol", { class: "steps" },
        h("li", {}, h("b", {}, "Add your heroes"), " below: class, level, power, skills and what each of the 6 slots wears now (item, quality, element, spirit). Start with your strongest few; you can add more later."),
        h("li", {}, h("b", {}, "Fill in your storage"), " (optional but useful): Epic and Legendary items and enchants you already own, plus Titan Souls and skill dice. The site uses what you own first, because it is free."),
        h("li", {}, h("b", {}, "Add your blueprints"), " (optional): items you can craft. The site then says “craft it yourself” instead of “buy it on the Market”."),
        h("li", {}, h("b", {}, "Press “Compute”"), ". The site works out the best build for every hero and what is missing. It runs in your browser and takes about 10–60 seconds per hero; keep the tab in front."),
        h("li", {}, h("b", {}, "Read the results"), ": ", h("a", { href: "/" }, "Heroes"), " (each hero, slot by slot, with a what-if panel), ",
          h("a", { href: "/team" }, "Team"), " (your whole roster in charts) and ", h("a", { href: "/ext/bucket.html" }, "Bucket list"),
          " (what to craft or buy, biggest win first). New here? Read the ", h("a", { href: "/guide/" }, "Guide"), ".")),
      h("div", { class: "actions" },
        h("button", { class: "primary", onclick: recompute, disabled: n ? null : true }, `Compute (${n} heroes)`),
        h("button", { onclick: () => importInput.click() }, "Import files"),
        h("button", { onclick: exportAll }, "Export (backup file)"),
        n ? h("button", { class: "danger", onclick: wipe }, "Delete everything") : null),
      h("p", { class: "muted small" }, "Import takes hero, inventory and blueprint files from the Claude Code version of this tool (data/roster/*.json), or a backup made with Export."));
  }

  function banner() {
    if (!dirty) return null;
    return h("div", { class: "banner" }, h("span", { class: "grow" }, "Your data changed. Press “Compute” to update the review and the bucket list."),
      h("button", { class: "primary", onclick: recompute }, "Compute"));
  }

  function heroList() {
    const names = Object.keys(heroes).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    return h("section", { class: "card" },
      h("h2", {}, "Heroes", h("span", { class: "muted" }, `(${names.length})`), h("span", { class: "grow" }),
        h("button", { class: "primary", onclick: () => { editing = blankHero(); render(); } }, "+ New hero")),
      editing ? editor() : null,
      names.length ? h("div", { class: "heroes" }, names.map((n) => {
        const d = heroes[n];
        const gear = (d.slots || []).filter((s) => s.item).map((s) => `${s.item}${s.quality && s.quality !== "Epic" ? " (" + s.quality + ")" : ""}`).join(" · ");
        return h("div", { class: "hero-row" },
          h("span", { class: "name" }, n), h("span", {}, `${d.class || "?"} · L${d.level || "?"} · ${((d.stats || {}).power || 0).toLocaleString("en")} power`),
          h("span", { class: "gear" }, gear || "no gear yet"),
          h("button", { class: "small", onclick: () => { editing = JSON.parse(JSON.stringify(d)); editing._was = n; render(); } }, "Edit"),
          h("button", { class: "small danger", onclick: () => delHero(n) }, "Delete"));
      })) : h("p", { class: "muted" }, "No heroes yet. Press “+ New hero” and copy one from the game."));
  }

  function blankHero() {
    return { hero: "", class: "", level: 40, promoted: false, seeds: null, cardLevel: null, skills: [], elementShown: null,
             stats: { power: null }, slots: [1, 2, 3, 4, 5, 6].map((n) => ({ slot: n, empty: true })), source: "site" };
  }

  function editor() {
    const e = editing;
    const c = cls(e.class);
    const field = (label, input, help) => h("label", { class: "f" }, label, input, help ? hint(help) : null);
    const classSel = h("select", { onchange: (ev) => { e.class = ev.target.value; e.promoted = !!(cls(e.class) || {}).promoted; render(); } },
      h("option", { value: "" }, "— pick the class —"),
      ["Fighter", "Rogue", "Spellcaster"].map((type) => h("optgroup", { label: type },
        cat.classes.filter((x) => x.type === type).map((x) => h("option", { value: x.name, selected: x.name === e.class }, x.name)))));
    const skillNames = skillsFor(c).flatMap((s) => [s.name, ...s.tiers.slice(1)]);
    const top = h("div", { class: "grid" },
      field("Hero name", h("input", { value: e.hero, placeholder: "as in the game", oninput: (ev) => { e.hero = ev.target.value; } }),
            "Any name you like; it just tells your heroes apart."),
      field("Class", classSel, "The class shown on the hero screen. A promoted class (e.g. Sensei, not Ninja) counts as promoted."),
      field("Level", h("input", { type: "number", min: 1, max: 60, value: e.level, oninput: (ev) => { e.level = +ev.target.value || null; } }),
            "Sets the highest item tier the hero can wear."),
      field("Power (required)", h("input", { type: "number", min: 0, value: (e.stats || {}).power, oninput: (ev) => { e.stats = Object.assign({}, e.stats, { power: ev.target.value === "" ? null : +ev.target.value }); } }),
            "The hero's power as the game shows it. The site checks its own maths against it."),
      field("Element (optional)", h("input", { type: "number", min: 0, value: e.elementShown, oninput: (ev) => { e.elementShown = ev.target.value === "" ? null : +ev.target.value; } }),
            "The element number on the hero screen. Leave empty if unsure."),
      field("Card level (optional)", h("input", { type: "number", min: 0, max: 10, value: e.cardLevel, oninput: (ev) => { e.cardLevel = ev.target.value === "" ? null : +ev.target.value; } }),
            "Collection Book → Card Collection: the level of this hero's class card."));
    const skills = h("div", {},
      h("h3", {}, "Skills"),
      h("p", { class: "muted small" }, "The 4 skills next to the innate one, in the game's order. Any tier's name works (e.g. Death Dealer or its base skill); the site works out the tier from the element. The innate skill comes from the class."),
      h("div", { class: "skills" }, list("sk-list", skillNames), [0, 1, 2, 3].map((i) => {
        const v = (e.skills || [])[i] || "";
        const known = !v || skillNames.includes(v) || cat.skills.some((s) => s.tiers.includes(v));
        return field(`Skill ${i + 1}`, h("input", { list: "sk-list", value: v, class: known ? null : "bad", placeholder: "start typing a skill name",
          onchange: (ev) => { e.skills = e.skills || []; e.skills[i] = ev.target.value.trim(); render(); } }), known ? null : "Not a skill this class can have.");
      })));
    const slots = h("div", {},
      h("h3", {}, "Equipment"),
      h("p", { class: "muted small" }, "What each slot wears right now. Leave the item empty for an empty slot. Quality is the item's colour: purple Epic, gold Legendary, cyan Flawless, green Superior, grey Normal. Element and spirit are the enchants on the item (leave empty if none). Start typing and pick from the list."),
      h("div", { class: "slots" },
        list("el-list", cat.elements), list("sp-list", cat.spirits),
        (e.slots || []).map((s, i) => {
          const types = c ? c.slots[String(s.slot)] || [] : [];
          const its = itemsFor(types);
          its.forEach((it) => itemByName.set(it.name, it));
          const id = `it-${s.slot}`;
          const okItem = !s.item || its.some((it) => it.name === s.item);
          const okEl = !s.element || cat.elements.includes(s.element);
          const okSp = !s.spirit || cat.spirits.includes(s.spirit);
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
            h("span", { class: "lbl" }, `Slot ${s.slot}`, h("br"), types.join(" / ") || "pick a class first"),
            list(id, its.map((it) => it.name)),
            h("input", { list: id, value: s.item || "", class: okItem ? null : "bad", placeholder: "item (empty = nothing)", title: okItem ? "" : "This item does not fit this slot for this class", onchange: set("item") }),
            h("select", { onchange: set("quality"), disabled: s.item ? null : true, "aria-label": "Quality" },
              cat.qualities.map((q) => h("option", { value: q, selected: (s.quality || "Epic") === q }, q))),
            h("input", { class: "el" + (okEl ? "" : " bad"), list: "el-list", value: s.element || "", placeholder: "element enchant", onchange: set("element"), disabled: s.item ? null : true }),
            h("input", { class: "sp" + (okSp ? "" : " bad"), list: "sp-list", value: s.spirit || "", placeholder: "spirit enchant", onchange: set("spirit"), disabled: s.item ? null : true }));
        })));
    const errs = validate(e);
    return h("div", { class: "card editor" },
      h("h2", {}, e._was ? `Edit: ${e._was}` : "New hero"),
      top, skills, slots,
      errs.length ? h("p", { class: "err" }, "To fix: " + errs.join(" · ")) : null,
      h("div", { class: "actions" },
        h("button", { class: "primary", onclick: saveHero }, "Save hero"),
        h("button", { onclick: () => { editing = null; render(); } }, "Cancel")));
  }

  function validate(e) {
    const c = cls(e.class);
    const errs = [];
    if (!(e.hero || "").trim()) errs.push("add a name");
    if (!c) errs.push("pick the class");
    if (!((e.stats || {}).power > 0)) errs.push("add the hero's power");
    (e.slots || []).forEach((s) => {
      const types = c ? c.slots[String(s.slot)] || [] : [];
      if (s.item && !cat.items.some((it) => it.name === s.item && types.includes(it.type))) errs.push(`slot ${s.slot}: “${s.item}” does not fit (${types.join("/") || "no class"})`);
      if (s.element && !cat.elements.includes(s.element)) errs.push(`slot ${s.slot}: unknown element “${s.element}”`);
      if (s.spirit && !cat.spirits.includes(s.spirit)) errs.push(`slot ${s.slot}: unknown spirit “${s.spirit}”`);
    });
    return errs;
  }

  async function saveHero() {
    const e = editing;
    const errs = validate(e);
    if (errs.length) { alert("Please fix first: " + errs.join(" · ")); render(); return; }
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
    if (!confirm(`Delete “${name}”?`)) return;
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
    const row = (arr, i, nameList) => {
      const r = arr[i];
      return h("tr", {},
        h("td", {}, h("input", { list: nameList, value: r.item || "", "aria-label": "Name", onchange: (ev) => { r.item = ev.target.value.trim(); const it = cat.items.find((x) => x.name === r.item); if (it) { r.tier = it.tier; r.type = it.type; } saveInventory(); } })),
        h("td", {}, h("select", { "aria-label": "Quality", onchange: (ev) => { r.quality = ev.target.value; saveInventory(); } },
          cat.qualities.map((q) => h("option", { value: q, selected: (r.quality || "Epic") === q }, q)))),
        h("td", { class: "n" }, h("input", { type: "number", min: 0, value: r.count || 0, "aria-label": "How many", onchange: (ev) => { r.count = +ev.target.value || 0; saveInventory(); } })),
        h("td", {}, h("button", { class: "small danger", "aria-label": "Remove row", onclick: () => { arr.splice(i, 1); saveInventory(); render(); } }, "✕")));
    };
    const table = (title, arr, nameList, help) => h("div", {},
      h("h3", {}, title), h("p", { class: "muted small" }, help),
      h("table", {}, h("tr", {}, h("th", {}, "Name"), h("th", {}, "Quality"), h("th", {}, "How many"), h("th", {})),
        arr.map((_, i) => row(arr, i, nameList))),
      h("div", { class: "actions" }, h("button", { class: "small", onclick: () => { arr.push({ item: "", quality: "Epic", count: 1 }); render(); } }, "+ Add row")));
    const have = (name) => (inventory.consumables.find((c) => c.name === name) || {}).count || 0;
    const setHave = (name, v) => {
      let c = inventory.consumables.find((x) => x.name === name);
      if (!c) { c = { name, count: 0, hero: true }; inventory.consumables.push(c); }
      c.count = v;
      saveInventory();
    };
    return h("section", { class: "card" },
      h("h2", {}, "Storage"),
      h("p", { class: "muted" }, "Optional. What you already own is used first, because equipping it costs nothing. Only Epic and Legendary gear matters: lower qualities are never suggested. Changes save on their own."),
      list("inv-items", allItems), list("inv-ench", [...cat.elements, ...cat.spirits]),
      table("Items (Epic / Legendary only)", inventory.items, "inv-items", "Gear in storage that one of your heroes could wear."),
      table("Enchants (elements and spirits)", inventory.enchants, "inv-ench", "One row per card: the same enchant in another quality is a separate row. An item takes only enchants of its own quality or better."),
      h("h3", {}, "Consumables"),
      h("p", { class: "muted small" }, "Titan Souls go to promotions; skill dice go to rerolls; seeds and blossoms raise stats."),
      h("div", { class: "grid" }, cat.consumables.map((n) => h("label", { class: "f" }, n,
        h("input", { type: "number", min: 0, value: have(n), onchange: (ev) => setHave(n, +ev.target.value || 0) })))),
      h("div", { class: "grid", style: "margin-top:10px" }, h("label", { class: "f" }, "Gems",
        h("input", { type: "number", min: 0, value: inventory.gems == null ? "" : inventory.gems,
                     onchange: (ev) => { inventory.gems = ev.target.value === "" ? null : +ev.target.value; saveInventory(); } }),
        hint("Only shown for reference; the site never plans to spend gems."))));
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
    input = h("input", { list: "bp-list", placeholder: "item name", onkeydown: (ev) => { if (ev.key === "Enter") add(); } });
    return h("section", { class: "card" },
      h("h2", {}, "Blueprints", h("span", { class: "muted" }, `(${blueprints.unlocked.length})`)),
      h("p", { class: "muted" }, "Optional. Blueprints you have unlocked for the items your heroes could use (tier 13 and up is enough). Crafting is cheaper than buying, so an item here is marked “craft it yourself”; anything else is suggested from the Market."),
      list("bp-list", names),
      h("div", { class: "actions" }, input, h("button", { onclick: add }, "Add")),
      h("div", { class: "chips" }, blueprints.unlocked.slice().sort().map((n) => h("span", { class: "chip" }, n,
        h("button", { "aria-label": "Remove " + n, onclick: () => { blueprints.unlocked = blueprints.unlocked.filter((x) => x !== n); saveBlueprints(); render(); } }, "✕")))));
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
      h("span", { class: "grow" }, r.ok ? `Done: review ready for ${r.heroes} heroes. Open Heroes to see each one slot by slot, or the Bucket list for what to gather.` : "Could not compute: " + r.error),
      r.ok ? h("a", { class: "btn", href: "/" }, "Heroes") : null, r.ok ? h("a", { class: "btn", href: "/ext/bucket.html" }, "Bucket list") : null));
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
    if (!confirm("Delete all heroes, storage and blueprints? (Export a backup first if you may want them back.)")) return;
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
        if (!confirm(`“${f.name}” replaces your whole account. Continue?`)) continue;
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
    alert(`Imported ${out.length} file(s).` + (skipped.length ? `\nNot recognised: ${skipped.join(", ")}` : ""));
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
  })().catch((err) => { root.replaceChildren(h("p", { class: "err" }, "Error: " + err.message)); });
})();
