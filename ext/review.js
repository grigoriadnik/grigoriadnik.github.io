"use strict";
// Review panel (session `review`): per-slot recommendations with their source, a what-if editor measured with
// calc.diff, and the roster-wide lists (top moves, craft, Market, dice). API: web/ext/review.py.
(function () {
  const ST = window.ST;
  const h = ST.h;
  const num = ST.num;
  const enc = encodeURIComponent;
  document.head.append(h("link", { rel: "stylesheet", href: "/ext/review.css" }));

  const SRC_CLASS = { enchant: "free", inventory: "free", freed: "free", seeds: "free", craft: "craft", promotion: "craft",
                      market: "market", special: "special" };
  const SRC_SHORT = { enchant: "Δωρεάν · enchant", inventory: "Δωρεάν · αποθήκη", freed: "Δωρεάν · από άλλον ήρωα",
                      seeds: "Δωρεάν · seeds", craft: "Craft", market: "Market", special: "Αν το έχεις", promotion: "Promotion" };
  const DELTA_KEYS = ["power", "attack", "defense", "hp", "evasion", "critChance", "critDamage", "element", "threat"];
  const CONF = { high: ["ok", "Σίγουρα νούμερα"], medium: ["warn", "Σχεδόν σωστά"], low: ["bad", "Αβέβαια νούμερα"] };

  let tab = "hero";
  try { tab = localStorage.getItem("st-review-tab") || "hero"; } catch (e) { /* storage off */ }
  let summary = null;
  let renderToken = 0;

  const plus = (v) => (v > 0 ? "+" : v < 0 ? "−" : "±") + num(Math.abs(v));
  const srcChip = (kind, title) => h("span", { class: "chip src-" + (SRC_CLASS[kind] || "special"), title: title || "" }, SRC_SHORT[kind] || kind);
  const qText = (q) => h("span", { class: "q-text-" + (q || "Normal") }, q || "—");
  const short = (name) => (name || "").replace(/ (Element|Spirit)$/, "");

  // A game name that opens web's info popup (web/static/info.js): data-info = the full name ("Tornado Element").
  const info = (name, text, kind, tag) => name
    ? h(tag || "span", { class: "st-info", "data-info": name, "data-info-kind": kind, tabindex: "0", role: "button" }, text || name)
    : text || "—";
  // The native replaceChildren writes false/null as text: drop them first.
  const fill = (el, ...kids) => el.replaceChildren(...kids.flat(Infinity).filter((k) => k != null && k !== false && k !== ""));

  function enchants(o) {
    const el = o.element ? [info(o.element, short(o.element), "element"), o.elementBuiltIn ? " (built in)" : ""] : "χωρίς element";
    const sp = o.spirit ? [info(o.spirit, short(o.spirit), "spirit"), o.spiritBuiltIn ? " (built in)" : ""] : "χωρίς spirit";
    return [el, " · ", sp];
  }

  function itemLine(o) {
    return h("span", { class: "rv-item" },
      info(o.item, null, "item", "strong"), " ", o.tier != null ? `T${o.tier} ` : "", qText(o.quality),
      h("span", { class: "muted" }, " · ", enchants(o)));
  }

  // ------------------------------------------------------------------ panel
  ST.registerPanel("review", {
    kinds: ["hero", "champion"],
    render(d, el) {
      const token = ++renderToken;
      const body = h("div", { class: "rv-body" }, h("p", { class: "muted" }, "Φόρτωση review…"));
      const tabs = h("div", { class: "rv-tabs right", role: "tablist" },
        [["hero", d.kind === "champion" ? "Ο champion" : "Ο ήρωας"], ["roster", "Όλο το ρόστερ"]].map(([k, label]) =>
          h("button", { type: "button", role: "tab", class: "rv-tab" + (tab === k ? " on" : ""), "aria-selected": tab === k ? "true" : "false",
                        onclick: () => { tab = k; try { localStorage.setItem("st-review-tab", k); } catch (e) { /* off */ }
                                         ST.panels.review.render(d, el); } }, label)));
      el.replaceChildren(h("h2", {}, "Review / what-if", tabs), body);
      const load = tab === "roster" ? loadSummary().then((s) => renderRoster(s, body))
        : ST.api(`/api/review/${enc(d.kind)}/${enc(d.id)}`).then((r) => renderHero(r, d, body));
      load.catch((e) => {
        if (token === renderToken) body.replaceChildren(h("div", { class: "note warn" }, e.message));
      });
    },
  });

  async function loadSummary(force) {
    if (!summary || force) summary = await ST.api("/api/review/summary");
    return summary;
  }

  // ------------------------------------------------------------------ one hero
  function renderHero(r, d, body) {
    const sc = r.score;
    const conf = CONF[r.confidence.level] || CONF.low;
    const bar = h("div", { class: "rv-bar", title: `τώρα ${sc.pct}% · μετά το πλάνο ${sc.afterPlanPct}%` },
      h("div", { class: "rv-bar-plan", style: `width:${Math.min(100, sc.afterPlanPct || 0)}%` }),
      h("div", { class: "rv-bar-now", style: `width:${Math.min(100, sc.pct || 0)}%` }));
    const head = h("div", { class: "rv-score" },
      h("div", { class: "rv-big", title: CEILING_TEXT }, num(sc.pct, 1) + "%",
        h("span", { class: "muted small" }, " του καλύτερου δυνατού"),
        sc.afterPlanPct != null && h("span", { class: "rv-arrow" }, " → " + num(sc.afterPlanPct, 1) + "% με το πλάνο")),
      h("div", { class: "muted small" }, CEILING_TEXT),
      bar,
      h("div", { class: "muted small" },
        `Power: παιχνίδι ${num(r.power.shown)} · calc ${num(sc.current)} · μετά το πλάνο ${num(sc.afterPlan)} · ` +
        `με ό,τι έχεις ή φτιάχνεις ${num(sc.owned)} · καλύτερο (Epic + τα Legendary σου) ${num(sc.ceiling)}` +
        (sc.stc ? ` · STC BiS (Epic) ${num(sc.stc)}` : "")),
      h("div", { class: "chips" },
        h("span", { class: "chip " + conf[0], title: r.confidence.text }, conf[1] +
          (r.confidence.diffPct != null ? ` (calc ${r.confidence.diffPct > 0 ? "+" : ""}${num(r.confidence.diffPct, 1)}%)` : "")),
        r.stale && h("span", { class: "chip warn" }, "Ο ήρωας ξαναδιαβάστηκε μετά το review — ξανατρέξε το"),
        h("span", { class: "chip" }, "review " + (r.generatedAt || "").slice(0, 16).replace("T", " "))),
      r.confidence.level !== "high" && h("div", { class: "note small" }, r.confidence.text));

    const gaps = r.gaps && r.gaps.length
      ? h("ul", { class: "rv-gaps" }, r.gaps.map((g) => h("li", { class: "gap-" + g.kind }, g.text)))
      : h("p", { class: "muted" }, "Κανένα μεγάλο κενό.");

    const editor = whatIfEditor(r, d);
    const slots = h("div", { class: "rv-slots" }, r.slots.map((s) => slotBlock(s, editor)));
    const known = {};
    for (const c of r.classSkills || []) known[c.name] = c;
    const skills = h("div", { class: "rv-skills" }, r.skills.map((k) => h("div", { class: "rv-skill" },
      skillIcon(known[k.name]), ratingBadge(k.rating),
      h("span", { class: "rv-sk-text" }, infoName(k.name, k.tierName || k.name),
        h("span", { class: "muted small" }, " " + (k.tierName && k.tierName !== k.name ? k.name + " · " : "") +
          (k.tier != null ? "T" + k.tier : "tier —") + (k.skillSlot ? " · slot " + (k.skillSlot - 1) : ""))),
      k.reroll && !r.rerolls && h("span", { class: "chip warn", title: "Το reroll είναι τύχη: μπορεί να βγει χειρότερο. Το συζητάμε πριν." },
        `reroll: ${Math.round(100 * (k.pBetter || 0))}% καλύτερο / ${Math.round(100 * (k.pWorse || 0))}% χειρότερο`),
      k.reroll && !r.rerolls && k.better && k.better.length > 0 && h("div", { class: "muted small rv-indent" }, "Καλύτερα: " + k.better.join(", ")))));

    fill(body, head,
      h("h3", {}, "Μεγάλα κενά πρώτα"), gaps,
      h("h3", {}, "Ανά slot"), slots,
      r.kind === "champion" && championExtras(r),
      h("h3", {}, "What-if"), editor.el,
      r.kind !== "champion" && h("h3", {}, "Skills"), r.kind !== "champion" && skills,
      (r.classSkills || []).length > 0 && classSkillsSection(r.classSkills),
      r.rerolls && h("h3", {}, "Rerolls — σχέδιο"), r.rerolls && rerollSection(r.rerolls));
  }

  // Skills: names carry data-info (base skill name) for the site's info popup.
  const CEILING_TEXT = "καλύτερο = items σε Epic + τα Legendary σου + τα καλύτερα enchants, με τα σημερινά skills, " +
    "χωρίς promotion, seeds και rerolls";
  const ratingBadge = (rating) => h("span", { class: "rating r-" + (rating === "S+" ? "Sp" : rating || "x"),
                                              title: rating ? "Rating (Default)" : "Χωρίς rating" }, rating || "—");
  const skillIcon = (c) => c && c.icon ? h("img", { class: "rv-sk-icon", src: c.icon, alt: "", loading: "lazy" })
                                       : h("span", { class: "rv-sk-icon" });
  const infoName = (name, text) => info(name, text, "skill", "strong");

  // Every skill the class can roll (review/rerolls.py class_skills), grouped by rating, best first.
  function classSkillsSection(list) {
    const RAR = { Epic: 0, Rare: 1, Common: 2 };
    const order = (a, b) => ((RAR[a.rarity] != null ? RAR[a.rarity] : 3) - (RAR[b.rarity] != null ? RAR[b.rarity] : 3)) ||
      a.name.localeCompare(b.name);
    const why = (c) => `Δεν βγαίνει τώρα από reroll: έχεις ${c.blockedBy.skill}` +
      (c.blockedBy.onlyFromThatSlot ? ` — μόνο αν ρίξεις το slot ${c.blockedBy.skillSlot}` : "");
    const blocks = [];
    for (const c of list) {  // list comes best rating first
      const key = c.rating || "";
      if (!blocks.length || blocks[blocks.length - 1].key !== key) blocks.push({ key, rows: [] });
      blocks[blocks.length - 1].rows.push(c);
    }
    const row = (c) => h("li", { class: "rv-cs-row", title: c.blockedBy ? why(c) : null },
      skillIcon(c), infoName(c.name), h("span", { class: "rv-rar rv-rar-" + c.rarity }, c.rarity),
      c.held && h("span", { class: "chip ok" }, "slot " + c.held));
    const part = (label, rows, cls, more) => rows.length > 0 && h("div", { class: "rv-cs-part " + cls },
      h("div", { class: "rv-cs-sub" }, label, more && h("span", { class: "rv-cs-more" }, more)),
      h("ul", { class: "rv-cs-list" }, rows.sort(order).map(row)));
    // the blocked ones by the held skill that keeps them out, the reason once in the group's header
    const blocked = (rows) => {
      const by = {};
      for (const c of rows) (by[c.blockedBy.skill] = by[c.blockedBy.skill] || []).push(c);
      return Object.values(by).map((g) => part("Δεν βγαίνουν τώρα", g, "blocked",
        ` · έχεις ${g[0].blockedBy.skill}` + (g[0].blockedBy.onlyFromThatSlot ? ` — μόνο αν ρίξεις το slot ${g[0].blockedBy.skillSlot}` : "")));
    };
    const held = list.filter((c) => c.held).length;
    return h("details", { class: "rv-cs" },
      h("summary", {}, h("span", { class: "rv-cs-title" }, "Όλα τα skills της class"),
        h("span", { class: "muted small" }, ` ${list.length} skills · έχεις ${held}`)),
      h("p", { class: "muted small" }, "Ανά rating (Default), καλύτερα πρώτα. Rarity: Common βγαίνει πιο συχνά σε reroll, Epic πιο σπάνια."),
      blocks.map((b) => {
        const mine = b.rows.filter((c) => c.held).length;
        return h("section", { class: "rv-cs-block" },
          h("div", { class: "rv-cs-head" }, ratingBadge(b.key || null),
            h("span", {}, (b.key ? "" : "Χωρίς rating · ") + `${b.rows.length} skills` + (mine ? ` · έχεις ${mine}` : ""))),
          part("Τα έχεις", b.rows.filter((c) => c.held), "mine"),
          part("Μπορούν να βγουν", b.rows.filter((c) => !c.held && !c.blockedBy), "open"),
          blocked(b.rows.filter((c) => !c.held && c.blockedBy)));
      }));
  }

  // Reroll planner (review/rerolls.py): per skill slot keep or roll, with which die, until which skills.
  const dieShort = (d) => (d || "").replace(" Skill Die", "");
  function rerollSection(rr) {
    const tasks = {};
    for (const t of rr.tasks || []) tasks[t.skillSlot] = t;
    const head = h("div", { class: "chips" },
      h("span", { class: "chip " + (rr.weak ? "warn" : "ok") }, `Skill set: ${Math.round(100 * rr.strength)}% των πιθανών`),
      rr.rerollBeforeItems && h("span", { class: "chip bad", title: "Τα skills του είναι αδύναμα και ένα καλό reroll αλλάζει τι πρέπει να φοράει" },
        "Reroll πριν από craft/αγορές για αυτόν"),
      (rr.rollsApplied || []).length > 0 && h("span", { class: "chip" }, `${rr.rollsApplied.length} ρίψεις από το log`));
    const rows = rr.slots.map((s) => {
      const t = tasks[s.skillSlot] || {};
      const title = h("div", { class: "rv-slot-head" }, h("strong", {}, `Skill slot ${s.skillSlot}: ${s.current}`),
        ratingBadge(s.rating),
        h("span", { class: "muted small" }, ` ${s.rarity || ""} · ${Math.round(100 * (s.percentile || 0))}% των πιθανών είναι κάτω του`),
        s.decision === "roll" ? h("span", { class: "chip " + (t.step === "now" ? "ok" : "") }, t.step === "now" ? "Ρίξε τώρα" : "Μετά από ξαναϋπολογισμό")
                              : h("span", { class: "chip" }, "Κράτα το"));
      const lines = [title];
      if (s.decision !== "roll") lines.push(h("div", { class: "muted small rv-indent" }, s.reason));
      else {
        const dice = Object.entries(t.dice || {}).map(([d, n]) => `${n} ${dieShort(d)}`).join(" + ") || "δεν φτάνουν τα ζάρια";
        lines.push(h("div", { class: "rv-indent" }, `Ζάρια: ${dice}. Ρίχνεις μέχρι να βγει ένα από: `,
          h("strong", {}, s.acceptLine.skills.join(", ")),
          h("span", { class: "muted small" }, ` — ${Math.round(100 * s.acceptLine.pAccept)}% ανά ρίψη, ~${num(s.expectedRolls, 1)} ρίψεις`),
          h("span", { class: "rv-gain" }, ` +${num(s.expectedGain)} power`)));
        lines.push(h("div", { class: "muted small rv-indent" },
          `Μία ρίψη: ${Math.round(100 * s.perRoll.pBetter)}% καλύτερο, ${Math.round(100 * s.perRoll.pWorse)}% χειρότερο. ` +
          `${Math.round(100 * s.pMissBudget)}% να μη φτάσει το budget.`));
        for (const d of s.discuss || []) lines.push(h("div", { class: "note small rv-indent" }, "Συζήτησε: " + d));
        for (const b of (s.buildChanging || []).slice(0, 3)) lines.push(h("div", { class: "muted small rv-indent" },
          `Αν βγει ${b.skill}: αλλαγή build → ${b.item} (${b.quality}, ${b.kind === "craft" ? "craft" : "αποθήκη"}) στο slot ${b.slot}, ` +
          `power ${num(b.powerWithout)} → ${num(b.powerWith)}. Σταματάς και το συζητάμε.`));
      }
      lines.push(h("details", { class: "rv-alts" }, h("summary", {}, `Όλα τα πιθανά (${s.poolSize})`),
        h("div", { class: "rv-scroll" }, h("table", { class: "rv-table" },
          h("thead", {}, h("tr", {}, ["Skill", "Rarity", "Πιθανότητα", "Tier", "Power", ""].map((x) => h("th", {}, x)))),
          h("tbody", {}, s.outcomes.map((o) => h("tr", { class: o.gain > 0 ? "up" : o.gain < 0 ? "down" : "" },
            h("td", {}, o.skill, o.rating ? ` [${o.rating}]` : ""), h("td", {}, o.rarity), h("td", { class: "num" }, num(100 * o.p, 1) + "%"),
            h("td", { class: "num" }, o.tier != null ? "T" + o.tier : "—"), h("td", { class: "num rv-d" }, plus(o.gain)),
            h("td", { class: "small" }, o.buildChange ? `αλλάζει build: ${o.buildChange.item}` : ""))))))));
      return h("div", { class: "rv-slot" + (s.decision === "roll" ? " change" : "") }, lines);
    });
    return h("div", {}, head, h("div", { class: "rv-slots" }, rows));
  }

  // Champions (review/champions.py): Power Ups, Titan Soul, seeds, and which heroes the leader skill lifts most.
  function championExtras(r) {
    const L = r.leader || {};
    const best = ((L.value || {}).best || []);
    const ups = (r.powerUps || []).map((p) => h("li", {}, p.text));
    const t = r.titanSoulOption;
    const seeds = Object.values(r.seeds || {}).filter((w) => w.given);
    return h("div", {},
      h("h3", {}, "Power Ups"), ups.length ? h("ul", {}, ups) : h("p", { class: "muted" }, "—"),
      t && h("div", { class: "note small" }, h("strong", {}, "Titan Soul: "), `+${num(t.gain.power)} power τώρα · έχεις ${num(t.stock)} · ` + t.how),
      seeds.length > 0 && h("p", { class: "small" }, "Seeds: " + seeds.map((w) => `${w.given} ${w.item} +${num(w.gain)}`).join(" · ")),
      h("h3", {}, "Leader skill στο party"),
      h("p", { class: "small" }, h("strong", {}, L.name || "—"), L.tier ? ` T${L.tier} — ` : " ", L.text || ""),
      best.length ? h("div", {}, h("p", { class: "muted small" }, (L.value || {}).note || ""),
        h("ol", { class: "rv-moves" }, best.map((b) => h("li", {}, heroLink(b.hero), ` (${b.class}): +${num(b.gain)} power (+${num(b.gainPct, 1)}%)`))))
        : h("p", { class: "muted small" }, "Το leader skill δεν έχει σταθερό stat effect (εξαρτάται από το party ή τους γύρους)."));
  }

  function slotBlock(s, editor) {
    const c = s.current;
    const rec = s.recommended;
    const head = h("div", { class: "rv-slot-head" },
      h("strong", {}, "Slot " + s.slot), h("span", { class: "muted small" }, " " + s.types.join(" / ")),
      rec ? h("span", { class: "chip ok" }, `Άλλαξε ${plus(rec.planGain != null ? rec.planGain : rec.gain.power)} power`)
          : h("span", { class: "chip" }, "Κράτα το"));
    const lines = [h("div", { class: "rv-cur" }, h("span", { class: "muted small" }, "Τώρα: "), itemLine(c))];
    if (rec) {
      const inPlan = rec.planGain != null ? rec.planGain : rec.gain.power;
      const differs = Math.abs(inPlan - rec.gain.power) > Math.max(50, 0.02 * Math.abs(rec.gain.power));
      lines.push(h("div", { class: "rv-rec" }, "→ ", srcChip(rec.kind, rec.detail), " ", itemLine(rec),
        h("span", { class: "rv-gain", title: "Κέρδος μέσα στο πλάνο, μαζί με τις άλλες αλλαγές του ήρωα" }, ` ${plus(inPlan)}`),
        differs && h("span", { class: "muted small", title: "Το what-if δείχνει αυτό όταν βάλεις μόνο αυτή την αλλαγή" }, ` (μόνο του ${plus(rec.gain.power)})`),
        tryBtn(editor, s.slot, rec)));
      if (rec.wanted && Object.keys(rec.wanted).length)
        lines.push(h("div", { class: "muted small rv-indent" }, "Δεν έμεινε " + Object.values(rec.wanted).map(short).join(", ") +
          ` ποιότητας ${rec.quality} ή καλύτερης: μπήκε το επόμενο καλύτερο που έχεις.`));
      if (rec.enchantStatus === "waits") lines.push(h("div", { class: "note small rv-indent" },
        `Θέλει ${Object.values(rec.enchantsMissing || {}).join(", ")} — δεν το έχεις: craft ή αγορά. ` +
        (rec.doNow ? `Φόρεσέ το από τώρα (${plus(rec.nowGain)}) και βάλε το enchant όταν το βρεις.`
                   : `Χωρίς αυτό δίνει ${plus(rec.nowGain)}: περίμενε το enchant.`)));
      if (rec.kind === "freed") lines.push(h("div", { class: "muted small rv-indent" },
        `Το item βγαίνει από τον ${rec.after} με το δικό του πλάνο, μαζί με τα enchants του: πρώτα εκείνη η αλλαγή.`));
      for (const n of rec.notes || []) lines.push(h("div", { class: "note small rv-indent" }, n));
    }
    for (const b of s.artifactBlocked || []) lines.push(h("div", { class: "muted small rv-indent" },
      `${b.item} (${b.quality}) θα έδινε ${plus(b.gain)}, αλλά είναι Artifact και ο ήρωας κρατάει ήδη άλλο (slot ${(b.with || []).join(", ")}): ένα Artifact ανά ήρωα.`));
    if (s.freedTo) lines.push(h("div", { class: "muted small rv-indent" }, `Το ${c.item} που βγαίνει πάει στον ${s.freedTo}.`));
    for (const t of s.taken || []) {
      lines.push(h("div", { class: "muted small rv-indent" }, t.noEnchant
        ? `${t.item} (${t.quality}) θα έδινε ${plus(t.gain)}, αλλά δεν έμεινε ${t.noEnchant.map(short).join(", ")} ποιότητας ${t.quality} ή καλύτερης (ένα item παίρνει μόνο τέτοια): craft ή αγορά του enchant.`
        : `${t.item} (${t.quality}) της αποθήκης: πήγε στον ${(t.to || []).join(", ")} (κερδίζει περισσότερο)· εδώ θα έδινε ${plus(t.gain)}.`));
    }
    const alts = (s.options || []).filter((o) => !rec || o.item !== rec.item || o.quality !== rec.quality || o.kind !== rec.kind);
    if (alts.length) {
      lines.push(h("details", { class: "rv-alts" }, h("summary", {}, `Άλλες επιλογές (${alts.length})`),
        h("ul", {}, alts.map((o) => h("li", {}, srcChip(o.kind, o.detail), " ", itemLine(o),
          h("span", { class: "rv-gain" }, ` ${plus(o.gain.power)}`), tryBtn(editor, s.slot, o))))));
    }
    if ((s.alternatives || []).length) {
      lines.push(h("div", { class: "rv-indent small" }, h("span", { class: "muted" }, "Εναλλακτικά (αν δεν βρεις το πρώτο): "),
        s.alternatives.map((a, i) => h("span", {}, i ? " · " : "", srcChip(a.kind, a.detail), " ", info(a.item, null, "item"), ` T${a.tier} ${a.quality} `,
          h("span", { class: "rv-gain" }, plus(a.gain)), h("span", { class: "muted" }, ` (${a.closePct}%)`), tryBtn(editor, s.slot, a)))));
    }
    if (s.marketBetter) {
      const m = s.marketBetter;
      lines.push(h("div", { class: "rv-indent small" }, srcChip(m.kind, m.detail), " ", itemLine(m),
        h("span", { class: "rv-gain" }, ` ${plus(m.gain.power)} (${plus(m.extraPower)} πάνω από το πλάνο)`), tryBtn(editor, s.slot, m)));
    }
    if (s.legendary && s.legendary.worth) {
      lines.push(h("div", { class: "rv-indent small" }, h("span", { class: "chip q-legendary" }, "Legendary"),
        " ", info(s.legendary.item, null, "item"), `: ${plus(s.legendary.extraPower)} (${num(s.legendary.extraPct, 1)}%) πάνω από το Epic — τύχη (fusion/craft), μόνο με συζήτηση.`));
    }
    return h("div", { class: "rv-slot" + (rec ? " change" : "") }, head, lines);
  }

  function tryBtn(editor, slot, o) {
    return h("button", { type: "button", class: "rv-try", title: "Βάλ' το στο what-if",
      onclick: () => editor.set(slot, { item: o.item, quality: o.quality, element: o.change ? o.change.element : o.element,
                                        spirit: o.change ? o.change.spirit : o.spirit }) }, "Δοκίμασε");
  }

  // ------------------------------------------------------------------ what-if
  function whatIfEditor(r, d) {
    const pending = new Map(); // slot -> change
    const optsCache = {};
    const sel = (attrs) => h("select", attrs);
    const slotSel = sel({ "aria-label": "Slot" });
    for (const s of r.slots) slotSel.append(h("option", { value: s.slot }, "Slot " + s.slot + (s.types ? " · " + s.types.join("/") : "")));
    const itemSel = sel({ "aria-label": "Item", class: "rv-wide" });
    const qSel = sel({ "aria-label": "Quality" });
    const elSel = sel({ "aria-label": "Element" });
    const spSel = sel({ "aria-label": "Spirit" });
    const list = h("div", { class: "chips rv-pending" });
    const out = h("div", { class: "rv-out" }, h("p", { class: "muted small" },
      "Διάλεξε slot και item (ή πάτα «Δοκίμασε» σε μια πρόταση) για να δεις πώς αλλάζουν τα stats και το power."));

    async function options(slot) {
      if (!optsCache[slot]) optsCache[slot] = await ST.api(`/api/review/${enc(d.kind)}/${enc(d.id)}/options?slot=${slot}`);
      return optsCache[slot];
    }
    function fillSelect(el, groups, value) {
      el.replaceChildren(...groups.map(([label, rows]) => rows.length ? h("optgroup", { label }, rows.map(([v, t]) =>
        h("option", { value: v, selected: v === value }, t))) : null).filter(Boolean));
      if (value != null && el.value !== value) el.value = groups[0] && groups[0][1][0] ? groups[0][1][0][0] : "";
    }
    async function load(slot, ch) {
      const o = await options(slot);
      const cur = o.current || {};
      ch = ch || pending.get(slot) || { item: cur.item, quality: cur.quality, element: cur.element, spirit: cur.spirit };
      const bySrc = {};
      for (const it of o.items) (bySrc[it.source.label] = bySrc[it.source.label] || []).push(it);
      const groups = Object.entries(bySrc).map(([label, rows]) => [label, rows.map((it) => [it.name,
        `T${it.tier} ${it.name} (${it.type})` + (it.owned.length ? " · έχεις " + it.owned.join("/") : "") +
        (it.name === cur.item ? " · φοράει τώρα" : "")])]);
      fillSelect(itemSel, groups, ch.item);
      qSel.replaceChildren(...o.qualities.map((q) => h("option", { value: q, selected: q === (ch.quality || "Epic") }, q)));
      const elGroups = {};
      for (const e of o.elements) (elGroups[e.type] = elGroups[e.type] || []).push([e.name, `${short(e.name)} T${e.tier} (+${e.amount})` + (e.stock ? ` · stock ${e.stock}` : "")]);
      fillSelect(elSel, [["—", [["", "χωρίς element / built in"]]], ...Object.entries(elGroups)], ch.element || "");
      fillSelect(spSel, [["—", [["", "χωρίς spirit / built in"]]], ["Spirits", o.spirits.map((s) =>
        [s.name, `${short(s.name)} T${s.tier}` + (s.stock ? ` · stock ${s.stock}` : "") + ` — ${s.effect}`])]], ch.spirit || "");
      builtIns(o);
    }
    function builtIns(o) {
      const it = o.items.find((x) => x.name === itemSel.value);
      elSel.disabled = !!(it && it.builtInElement);
      spSel.disabled = !!(it && it.builtInSpirit);
      elSel.title = elSel.disabled ? "Built in: " + it.builtInElement : "";
      spSel.title = spSel.disabled ? "Built in: " + it.builtInSpirit : "";
    }
    function current() {
      return { slot: Number(slotSel.value), item: itemSel.value, quality: qSel.value,
               element: elSel.disabled ? null : elSel.value || null, spirit: spSel.disabled ? null : spSel.value || null };
    }
    function drawPending() {
      list.replaceChildren(...[...pending.values()].sort((a, b) => a.slot - b.slot).map((c) =>
        h("span", { class: "chip accent" }, `Slot ${c.slot}: `, info(c.item, null, "item"), ` ${c.quality}`,
          c.element && [" · ", info(c.element, short(c.element), "element")], c.spirit && [" · ", info(c.spirit, short(c.spirit), "spirit")],
          h("button", { type: "button", class: "rv-x", "aria-label": "Βγάλ' το", onclick: () => { pending.delete(c.slot); drawPending(); run(); } }, "✕"))));
    }
    let runToken = 0;
    async function run() {
      const token = ++runToken;
      if (!pending.size) {
        out.replaceChildren(h("p", { class: "muted small" }, "Καμία αλλαγή."));
        return;
      }
      out.replaceChildren(h("p", { class: "muted small" }, "Υπολογισμός…"));
      try {
        const res = await ST.api(`/api/review/${enc(d.kind)}/${enc(d.id)}/diff`, {
          method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ changes: [...pending.values()] }) });
        if (token !== runToken) return;
        out.replaceChildren(result(res));
      } catch (e) {
        if (token === runToken) out.replaceChildren(h("div", { class: "note bad" }, e.message));
      }
    }
    function result(res) {
      if (!res.available) return h("div", { class: "note warn" }, "Το calc δεν έτρεξε: " + (res.error || res.reason || ""));
      const rows = DELTA_KEYS.map((k) => {
        const dv = res.delta[k];
        return h("tr", { class: dv > 0 ? "up" : dv < 0 ? "down" : "" },
          h("th", {}, (ST.STATS[k] || {}).label || k),
          h("td", { class: "num" }, ST.fmtStat(k, res.before[k])),
          h("td", { class: "num" }, ST.fmtStat(k, res.stats[k])),
          h("td", { class: "num rv-d" }, dv ? (dv > 0 ? "+" : "−") + ST.fmtStat(k, Math.abs(dv)) : "—"));
      });
      const before = {};
      for (const s of d.skills || []) before[s.name] = s.tier;
      const moved = (res.skills || []).filter((s) => before[s.name] != null && before[s.name] !== s.tier)
        .map((s) => `${s.name} T${before[s.name]}→T${s.tier}`);
      const pct = res.before.power ? (100 * res.delta.power) / res.before.power : 0;
      return h("div", {},
        h("div", { class: "rv-big small-big" }, `Power ${plus(res.delta.power)}`, h("span", { class: "muted small" }, ` (${num(pct, 1)}%)`)),
        h("table", { class: "rv-table" }, h("thead", {}, h("tr", {}, h("th", {}, ""), h("th", {}, "Τώρα"), h("th", {}, "Μετά"), h("th", {}, "Διαφορά"))),
          h("tbody", {}, rows)),
        res.artifactConflict && h("div", { class: "note bad small" }, "Δύο Artifacts στον ίδιο ήρωα δεν γίνεται (ένα ανά ήρωα): " +
          res.artifacts.map((a) => `slot ${a.slot} ${a.item}`).join(", ") + ". Το παιχνίδι δεν θα σε αφήσει να το φορέσεις."),
        moved.length > 0 && h("div", { class: "note warn small" }, "Αλλάζουν skill tiers (element " + res.elementUsed + "): " + moved.join(", ")),
        (res.warnings || []).length > 0 && h("details", { class: "small" }, h("summary", {}, `Σημειώσεις του calc (${res.warnings.length})`),
          h("ul", {}, res.warnings.map((w) => h("li", {}, w)))));
    }

    slotSel.addEventListener("change", () => load(Number(slotSel.value)));
    itemSel.addEventListener("change", async () => {
      const o = await options(Number(slotSel.value));
      const it = o.items.find((x) => x.name === itemSel.value);
      if (it && it.owned.length) qSel.value = it.owned.includes("Legendary") ? "Legendary" : it.owned[0];
      else if (it) qSel.value = "Epic";
      builtIns(o);
    });
    const addBtn = h("button", { type: "button", class: "rv-btn primary", onclick: () => { const c = current(); pending.set(c.slot, c); drawPending(); run(); } }, "Υπολόγισε");
    const planBtn = h("button", { type: "button", class: "rv-btn", onclick: () => {
      pending.clear();
      for (const s of r.slots) if (s.recommended) pending.set(s.slot, Object.assign({}, s.recommended.change));
      drawPending(); run();
    } }, "Όλο το πλάνο");
    const clearBtn = h("button", { type: "button", class: "rv-btn", onclick: () => { pending.clear(); drawPending(); run(); } }, "Καθάρισμα");

    const el = h("div", { class: "rv-whatif" },
      h("div", { class: "rv-form" },
        h("label", {}, h("span", { class: "muted small" }, "Slot"), slotSel),
        h("label", { class: "rv-wide" }, h("span", { class: "muted small" }, "Item"), itemSel),
        h("label", {}, h("span", { class: "muted small" }, "Quality"), qSel),
        h("label", {}, h("span", { class: "muted small" }, "Element"), elSel),
        h("label", {}, h("span", { class: "muted small" }, "Spirit"), spSel)),
      h("div", { class: "rv-actions" }, addBtn, planBtn, clearBtn,
        h("span", { class: "muted small" }, "Μία αλλαγή ανά slot· όσες βάλεις μετράνε μαζί.")),
      list, out);
    load(1).catch((e) => out.replaceChildren(h("div", { class: "note bad" }, e.message)));
    return {
      el,
      async set(slot, ch) {
        slotSel.value = String(slot);
        pending.set(slot, Object.assign({ slot }, ch));
        await load(slot, ch);
        drawPending();
        run();
        el.scrollIntoView({ behavior: "smooth", block: "nearest" });
      },
    };
  }

  // ------------------------------------------------------------------ roster
  function goTo(id) { location.hash = "hero/" + enc(id); }
  const heroLink = (id) => h("a", { href: "#hero/" + enc(id), onclick: (e) => { e.preventDefault(); goTo(id); } }, id);
  const champLink = (id) => h("a", { href: "#champion/" + enc(id), onclick: (e) => { e.preventDefault(); location.hash = "champion/" + enc(id); } }, id);

  function table(cols, rows) {
    return h("div", { class: "rv-scroll" }, h("table", { class: "rv-table" },
      h("thead", {}, h("tr", {}, cols.map((c) => h("th", { class: c[2] || "" }, c[0])))),
      h("tbody", {}, rows.map((r) => h("tr", {}, cols.map((c) => h("td", { class: c[2] || "" }, c[1](r))))))));
  }

  function renderRoster(s, body) {
    const heroes = table([
      ["Ήρωας", (x) => heroLink(x.id)], ["Class", (x) => x.class + (x.promoted ? "" : " (όχι promoted)")],
      ["Power", (x) => num(x.powerShown), "num"],
      ["Τώρα → πλάνο", (x) => h("div", { class: "rv-mini" },
        h("div", { class: "rv-bar" }, h("div", { class: "rv-bar-plan", style: `width:${Math.min(100, x.afterPlanPct)}%` }),
          h("div", { class: "rv-bar-now", style: `width:${Math.min(100, x.pct)}%` })),
        h("span", { class: "small" }, `${num(x.pct, 1)}% → ${num(x.afterPlanPct, 1)}%`))],
      ["Αλλαγές", (x) => x.changes, "num"],
      ["Promotion", (x) => (x.promotionGain ? "+" + num(x.promotionGain) : "—"), "num"],
      ["Σιγουριά", (x) => h("span", { class: "chip " + (CONF[x.confidence] || CONF.low)[0] }, (CONF[x.confidence] || CONF.low)[1])],
    ], s.heroes);
    const moves = h("ol", { class: "rv-moves" }, s.topMoves.map((m) => h("li", {},
      srcChip(m.kind), " ", heroLink(m.hero), m.slot ? ` slot ${m.slot}: ` : ": ", m.text,
      h("span", { class: "rv-gain" }, ` +${num(m.gain)} (${num(m.gainPct, 1)}%)`),
      m.enchantStatus === "waits" && h("div", { class: "muted small" }, `Θέλει ${Object.values(m.enchantsMissing || {}).join(", ")}· ` +
        (m.doNow ? `από τώρα ${plus(m.nowGain)}` : `χωρίς αυτό ${plus(m.nowGain)}, περίμενέ το`)),
      (m.notes || []).length > 0 && h("div", { class: "muted small" }, m.notes.join(" · ")),
      m.kind === "promotion" && h("div", { class: "muted small" }, "Κόστος: " + m.cost))));
    const craft = s.craft.length ? table([
      ["Item", (x) => info(x.item, null, "item", "strong")], ["Ποιότητα", (x) => qText(x.qualityTarget)],
      ["Για", (x) => h("span", {}, heroLink(x.hero), ` slot ${x.slot}`)], ["Enchants", (x) => enchants(x)],
      ["Κέρδος", (x) => "+" + num(x.gain), "num"], ["Έχεις φτιάξει", (x) => (x.amountCrafted != null ? num(x.amountCrafted) : "—"), "num"],
    ], s.craft) : h("p", { class: "muted" }, "Τίποτα για craft.");
    const shortList = (s.enchantsShort || []).length ? table([
      ["Enchant", (x) => h("strong", {}, x.enchant)], ["Πόσα ακόμα", (x) => x.count, "num"],
      ["Ποιότητα (τουλάχιστον)", (x) => Object.entries(x.minQuality || {}).map(([q, n]) => `${q} ×${n}`).join(", ")],
      ["Για", (x) => h("span", { class: "small" }, x.for.map((f) => `${f.hero} slot ${f.slot} (${f.item})`).join(", "))],
      ["Κέρδος που περιμένει", (x) => "+" + num(x.lost), "num"],
    ], s.enchantsShort) : null;
    const market = s.market.length ? table([
      ["Item", (x) => h("span", {}, info(x.item, null, "item", "strong"), ` T${x.tier}`)],
      ["Πόσο βρίσκεται", (x) => h("span", { class: "small" }, x.detail)],
      ["Για", (x) => h("span", {}, heroLink(x.hero), ` slot ${x.slot}`)], ["Αντί για", (x) => x.instead],
      ["Enchants", (x) => enchants(x)], ["Κέρδος", (x) => "+" + num(x.gain), "num"],
      ["Εναλλακτικά", (x) => h("span", { class: "small" }, (x.alternatives || []).map((a) =>
        `${a.item} T${a.tier} +${num(a.gain)} (${a.closePct}%, ${a.kind === "craft" ? "craft" : a.kind === "inventory" ? "αποθήκη" : "Market"})`).join(" · ") || "—")],
    ], s.market) : h("p", { class: "muted" }, "Καμία αγορά δεν χρειάζεται.");
    const rareList = (s.rare || []).length ? table([
      ["Item", (x) => h("span", {}, info(x.item, null, "item", "strong"), ` T${x.tier}`)], ["Γιατί σπάνιο", (x) => h("span", { class: "small" }, x.detail)],
      ["Για", (x) => h("span", {}, heroLink(x.hero), ` slot ${x.slot}`)], ["Πάνω από το πλάνο", (x) => "+" + num(x.extraPower), "num"],
    ], s.rare) : null;
    const rr = s.rerolls || {};
    const dz = rr.dice || {};
    const stock = Object.keys(dz.stock || s.diceStock || {}).map((k) =>
      `${dieShort(k)} ${num((dz.stock || s.diceStock)[k])}` + (dz.reserve ? ` (κράτα ${dz.reserve[k] || 0}, πλάνο ${(dz.planned || {})[k] || 0})` : "")).join(" · ");
    const rtasks = (rr.tasks || []).filter((t) => t.status === "planned");
    const dice = rtasks.length ? table([
      ["", (x) => h("span", { class: "chip " + (x.step === "now" ? "ok" : "") }, x.step === "now" ? "τώρα" : "μετά")],
      ["Ήρωας", (x) => h("span", {}, heroLink(x.hero), x.rerollBeforeItems ? " ⚑" : "")],
      ["Skill", (x) => h("span", {}, `slot ${x.skillSlot}: `, h("strong", {}, x.current), x.rating ? ` [${x.rating}]` : "")],
      ["Ζάρια", (x) => Object.entries(x.dice || {}).map(([d, n]) => `${n} ${dieShort(d)}`).join(" + ")],
      ["Μέχρι να βγει", (x) => h("span", { class: "small" }, x.acceptLine.skills.slice(0, 5).join(", ") + (x.acceptLine.skills.length > 5 ? "…" : ""))],
      ["Ρίψεις", (x) => "~" + num(x.expectedRolls, 1), "num"], ["Κέρδος", (x) => `+${num(x.expectedGain)} (${num(x.expectedGainPct, 1)}%)`, "num"],
      ["Συζήτησε", (x) => h("span", { class: "small" }, (x.discuss || []).join(" · ") || "—")],
    ], rtasks) : h("p", { class: "muted" }, "Κανένα skill για reroll.");
    const used = (s.allocation && s.allocation.enchantsUsed) || {};
    const left = (s.allocation && s.allocation.enchantsLeft) || {};
    const alloc = h("details", { class: "small" }, h("summary", {}, "Enchants και items που μοιράστηκαν"),
      h("p", {}, "Χρησιμοποιούνται: " + (Object.entries(used).map(([k, v]) => `${short(k)} ×${v.count}`).join(", ") || "—")),
      h("p", {}, "Μένουν: " + (Object.entries(left).map(([k, v]) => `${short(k)} ${v}`).join(", ") || "—")),
      h("p", {}, "Από την αποθήκη: " + (Object.entries((s.allocation || {}).itemsUsed || {}).map(([k, v]) => `${k} → ${v.join(", ")}`).join(" · ") || "—")));
    const rerun = h("button", { type: "button", class: "rv-btn", onclick: async () => {
      rerun.disabled = true; rerun.textContent = "Τρέχει…";
      try { await ST.api("/api/review/run", { method: "POST" }); await loadSummary(true); renderRoster(summary, body); }
      catch (e) { rerun.textContent = "Σφάλμα: " + e.message; }
    } }, "Ξανατρέξε το review");
    fill(body,
      h("div", { class: "rv-actions" }, h("span", { class: "muted small" }, `Review ${(s.generatedAt || "").slice(0, 16).replace("T", " ")} · gems ${num(s.gems)} (το πλάνο θέλει ${num(s.gemsNeeded)})`), rerun),
      (s.notes || []).length > 0 && h("ul", { class: "muted small" }, s.notes.map((n) => h("li", {}, n))),
      h("h3", {}, "Ήρωες"), heroes,
      h("h3", {}, "Top 10 κινήσεις"), moves,
      h("h3", {}, "Τι να κάνεις craft"), craft,
      shortList && h("h3", {}, "Enchants που δεν φτάνουν (craft ή αγορά)"),
      shortList && h("p", { class: "muted small" }, "Το stock μοιράστηκε σε όσους κερδίζουν περισσότερο· αυτές οι κινήσεις περιμένουν enchant."),
      shortList,
      h("h3", {}, "Αγορές από Market (με εναλλακτικά)"), market,
      rareList && h("h3", {}, "Σπάνια — μόνο αν τα βρεις"), rareList,
      h("h3", {}, "Rerolls — σχέδιο (τύχη)"),
      h("p", { class: "muted small" }, "Ζάρια: " + stock + ". " + ((rr.rerollFirst || []).length ? `⚑ Reroll πριν από craft/αγορές: ${rr.rerollFirst.join(", ")}. ` : "") +
        "Ένα slot ανά ήρωα κάθε φορά· μετά από κάθε ρίψη ξαναϋπολογίζεται. Κάθε ρίψη μπορεί να βγει χειρότερη· το συζητάμε."),
      (rr.notes || []).length > 0 && h("ul", { class: "muted small" }, rr.notes.map((n) => h("li", {}, n))), dice,
      alloc,
      championsRoster(s));
  }

  function championsRoster(s) {
    if (!(s.champions || []).length) return null;
    const rows = table([
      ["Champion", (x) => champLink(x.id)], ["", (x) => (x.title || "") + (x.titanSoul ? " · Titan Soul" : "")],
      ["Power", (x) => num(x.powerShown), "num"],
      ["Τώρα → πλάνο", (x) => h("div", { class: "rv-mini" },
        h("div", { class: "rv-bar" }, h("div", { class: "rv-bar-plan", style: `width:${Math.min(100, x.afterPlanPct)}%` }),
          h("div", { class: "rv-bar-now", style: `width:${Math.min(100, x.pct)}%` })),
        h("span", { class: "small" }, `${num(x.pct, 1)}% → ${num(x.afterPlanPct, 1)}%`))],
      ["Αλλαγές", (x) => x.changes, "num"],
      ["+1 Power Up", (x) => (x.nextPowerUp ? "+" + num(x.nextPowerUp) : "—"), "num"],
      ["Leader → ήρωες", (x) => h("span", { class: "small" }, (x.leader || "") + (x.leaderBest.length ? ": " + x.leaderBest.join(", ") : ""))],
    ], s.champions);
    const moves = h("ol", { class: "rv-moves" }, (s.championMoves || []).slice(0, 10).map((m) => h("li", {},
      srcChip(m.kind === "titanSoul" ? "special" : m.kind), " ", champLink(m.champion), m.slot ? ` slot ${m.slot}: ` : ": ", m.text,
      h("span", { class: "rv-gain" }, ` +${num(m.gain)} (${num(m.gainPct, 1)}%)`),
      (m.notes || []).length > 0 && h("div", { class: "muted small" }, m.notes.join(" · ")))));
    return h("div", {},
      h("h3", {}, "Champions"), h("p", { class: "muted small" }, "Οι champions παίρνουν ό,τι enchants και seeds αφήνει το πλάνο των ηρώων."),
      rows, h("h3", {}, "Top 10 κινήσεις champions"), moves);
  }
})();
