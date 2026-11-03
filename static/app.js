"use strict";
// Shop Titans site: one page, no build step. window.ST is the hook for the panels other sessions add
// (review, champions): ST.registerPanel, ST.registerKind, ST.openPopup, ST.diff. See web/README.md.
(function () {
  const ST = (window.ST = { meta: null, units: [], current: null, panels: {}, kinds: {} });
  const $ = (sel) => document.querySelector(sel);
  const enc = encodeURIComponent;

  // --- small helpers --------------------------------------------------------------------------------
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
  const img = (src, cls, alt) => (src ? h("img", { src, class: cls, alt: alt || "", loading: "lazy" }) : null);
  ST.h = h;

  function num(v, digits) {
    if (v == null || v === "") return "—";
    if (typeof v !== "number") return String(v);
    const d = digits != null ? digits : Number.isInteger(v) ? 0 : Math.abs(v) < 10 ? 3 : 2;
    return new Intl.NumberFormat("el-GR", { maximumFractionDigits: d }).format(v);
  }
  ST.num = num;

  const STATS = {
    attack: { label: "ATK", long: "Attack" },
    defense: { label: "DEF", long: "Defense" },
    hp: { label: "HP", long: "Health" },
    evasion: { label: "Evasion", unit: "%" },
    critChance: { label: "Crit Chance", unit: "%" },
    critDamage: { label: "Crit Damage", prefix: "×" },
    element: { label: "Element" },
    threat: { label: "Threat" },
    power: { label: "Power" },
  };
  function fmtStat(key, v) {
    if (v == null) return "—";
    const s = STATS[key] || {};
    return (s.prefix || "") + num(v) + (s.unit || "");
  }
  ST.fmtStat = fmtStat;
  ST.STATS = STATS;
  // calc and game agree when they differ by rounding only
  const agrees = (a, b) => Math.abs(a - b) <= Math.max(1, Math.abs(b) * 0.001);

  ST.api = async function (path, opts) {
    const r = await fetch(path, opts);
    let j = null;
    try { j = await r.json(); } catch (e) { /* not JSON */ }
    if (!r.ok) throw new Error((j && j.error) || "HTTP " + r.status);
    return j;
  };
  // calc.diff for the current or any unit: changes = [{slot, item, quality, element, spirit}]
  ST.diff = (kind, id, changes) =>
    ST.api(`/api/unit/${enc(kind)}/${enc(id)}/diff`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ changes }),
    });

  // --- popup ----------------------------------------------------------------------------------------
  ST.openPopup = function (title, body) {
    const dlg = $("#popup");
    $("#popup-title").textContent = title;
    $("#popup-body").replaceChildren(...[].concat(body).filter(Boolean));
    if (!dlg.open) dlg.showModal();
  };
  function initPopup() {
    const dlg = $("#popup");
    dlg.addEventListener("click", (e) => { if (e.target === dlg) dlg.close(); });
  }

  // --- extension points -----------------------------------------------------------------------------
  // panel: {render(detail, sectionEl)}; section #panel-<name> is used if the layout has one.
  ST.registerPanel = function (name, panel) {
    ST.panels[name] = panel;
    if (ST.current) renderPanels(ST.current);
  };
  // render(detail, mainEl) draws a whole unit of that kind (champions).
  ST.registerKind = function (kind, render) {
    ST.kinds[kind] = render;
    if (ST.current && ST.current.kind === kind) render(ST.current, $("#app"));
  };

  function renderPanels(d) {
    for (const [name, panel] of Object.entries(ST.panels)) {
      if (panel.kinds && !panel.kinds.includes(d.kind)) continue;
      let el = document.getElementById("panel-" + name);
      if (!el) {
        el = h("section", { id: "panel-" + name, class: "card", "data-panel": name });
        $("#app").append(el);
      }
      el.classList.remove("placeholder");
      el.replaceChildren();
      try { panel.render(d, el); } catch (e) {
        el.replaceChildren(h("div", { class: "note bad", text: `Το panel «${name}» έβγαλε σφάλμα: ${e.message}` }));
        console.error(e);
      }
    }
  }

  // --- hero view ------------------------------------------------------------------------------------
  function sourceText(d) {
    const src = { phone: "κινητό", screenshot: "screenshot", dowob: "dowob" }[d.source] || d.source || "—";
    const when = d.capturedAt ? " · " + new Date(d.capturedAt).toLocaleString("el-GR", { dateStyle: "short", timeStyle: "short" }) : "";
    return "Από " + src + when;
  }

  function heroHeader(d) {
    const c = d.class;
    const chips = [];
    if (d.promoted) chips.push(h("span", { class: "chip ok" }, "✓ Promoted"));
    else if (c.promotesTo) chips.push(h("span", { class: "chip warn" }, "Χωρίς promotion → ", img(c.promotesToIcon), c.promotesTo));
    if (c.isTitan) chips.push(h("span", { class: "chip accent", "data-noinfo": true }, "Titan"));
    chips.push(h("span", { class: "chip" }, sourceText(d)));
    if (d.gearSource) chips.push(h("span", { class: "chip", title: d.gearSource }, "Gear από review"));
    const seeds = d.seeds
      ? `Seeds: HP ${num(d.seeds.hp)} · ATK ${num(d.seeds.attack)} · DEF ${num(d.seeds.defense)}`
      : null;
    return h("section", { class: "card" },
      h("div", { class: "hero-head" },
        img(c.icon, "class-icon", c.name),
        h("div", {},
          h("h1", { text: d.name }),
          h("div", { class: "sub" }, [c.type, c.name].filter(Boolean).join(" · "), c.element ? " · " : "",
            img(c.elementIcon, null, c.element), c.element || ""),
          h("div", { class: "chips" }, chips)),
        h("div", { class: "hero-meta" },
          h("div", { class: "muted small" }, "Level"),
          h("div", { class: "lvl", text: d.level != null ? d.level : "—" }),
          seeds && h("div", { class: "muted small", text: seeds }),
          d.cardLevel != null && h("div", { class: "muted small", text: "Card level " + d.cardLevel }))));
  }

  function notesCard(d) {
    const notes = [];
    if (d.source === "dowob") {
      notes.push(h("div", { class: "note" },
        "Τα στοιχεία είναι από το dowob. " +
        (d.slots.every((s) => s.state === "unknown") ? "Το gear δεν έχει διαβαστεί ακόμα· θα έρθει από το κινητό. " : "") +
        (Object.entries(d.stats.shown).every(([k, v]) => k === "element" || v == null) ? "Τα stats δεν είχαν περαστεί εκεί." : "")));
    }
    for (const n of d.notes || []) notes.push(h("div", { class: "note warn", text: n }));
    return notes.length ? h("section", { class: "card" }, notes) : null;
  }

  function ratingBadge(letter, title) {
    const cls = letter ? "r-" + letter.replace("+", "p") : "r-none";
    return h("span", { class: "rating " + cls, title: title || "Rating" }, letter || "—");
  }

  function skillRow(s, d) {
    const pips = h("span", { class: "pips", "aria-hidden": "true" },
      s.tiers.map((t) => h("span", {
        class: "pip" + (t.reached ? " on" : t.lock === "promotion" ? " promo" : ""),
        title: `T${t.tier} ${t.name} · ${t.elementThreshold} element${t.requiresPromotion ? " + promotion" : ""}`,
      })));
    let next;
    if (s.tier == null) next = "Element άγνωστο: δεν ξέρω το tier.";
    else if (!s.next) next = "Στο max tier.";
    else if (s.next.lock === "promotion") next = `T${s.next.tier} ${s.next.name}: θέλει promotion (και ${s.next.elementThreshold} element).`;
    else next = `Επόμενο T${s.next.tier} ${s.next.name} στα ${s.next.elementThreshold} element (λείπουν ${s.next.elementThreshold - d.element.shown}).`;
    const others = Object.entries(s.ratings).filter(([set]) => set !== "Default");
    return h("div", { class: "skill" },
      img(s.icon, null, s.name) || h("span"),
      h("div", {},
        h("div", { class: "title" },
          s.innate && h("span", { class: "chip accent" }, "Innate"),
          infoName(s.tierName || s.name, "skill"),
          s.tier != null && h("span", { class: "tier-badge" }, "T" + s.tier),
          !s.innate && ratingBadge(s.rating, "Rating (Default)"),
          others.map(([set, l]) => h("span", { class: "chip", title: "Rating στο skill set " + set }, set + ": " + l)),
          s.tierName && s.tierName !== s.name && h("span", { class: "base" }, "(" + s.name + ")")),
        h("div", { class: "desc", text: s.description || "" }),
        h("div", { class: "muted small" }, pips, " ", next)));
  }

  function skillsCard(d) {
    const rows = [];
    if (d.innate) rows.push(skillRow(d.innate, d));
    for (const s of d.skills) rows.push(skillRow(s, d));
    return h("section", { class: "card" },
      h("h2", {}, "Skills", h("span", { class: "right muted small" }, "tier από το element που φαίνεται")), rows);
  }

  function elementCard(d) {
    const e = d.element;
    const shown = e.shown;
    const top = Math.max(shown || 0, e.maxNeededAfterPromotion || 0, 10);
    const scale = Math.ceil((top * 1.06) / 10) * 10;
    const pct = (v) => Math.min(100, (v / scale) * 100) + "%";
    const reachable = e.thresholds.filter((t) => d.promoted || !t.requiresPromotion);
    const nextOne = reachable.find((t) => !t.reached);
    const ok = shown != null && shown >= e.maxNeeded;

    const track = h("div", { class: "track", role: "img", "aria-label": `Element ${shown} από ${scale}` },
      h("div", { class: "rail" }),
      shown != null && h("div", { class: "fill", style: `width:${pct(shown)}` }),
      e.thresholds.map((t) => h("div", {
        class: "tick" + (t.reached ? " reached" : t.lock === "promotion" ? " promo" : ""),
        style: `left:${pct(t.value)}`,
        title: `${t.value}: ${t.skill} → T${t.tier} ${t.tierName}${t.requiresPromotion ? " (promotion)" : ""}`,
      })),
      shown != null && h("div", { class: "cursor", style: `left:${pct(shown)}` }),
      h("span", { class: "scale", style: "left:0" }, "0"),
      h("span", { class: "scale", style: "left:100%" }, String(scale)));

    const list = h("ul", { class: "thresholds" },
      e.thresholds.map((t) => h("li", { class: (t.reached ? "yes" : "no") + (t === nextOne ? " next" : "") },
        h("span", { class: "v", text: t.value }),
        h("span", { title: t.reached ? "Το έχει" : t.lock === "promotion" ? "Θέλει promotion" : "Λείπει element" },
          t.reached ? "✓" : t.lock === "promotion" ? "🔒" : "·"),
        h("span", {}, `${t.skill} → T${t.tier} ${t.tierName}`, t.innate ? " (innate)" : ""))));

    let summary;
    if (shown == null) summary = h("span", { class: "chip" }, "Element άγνωστο");
    else if (ok) summary = h("span", { class: "chip ok" }, `✓ Αρκεί για όλα τα tiers (θέλει ${e.maxNeeded})`);
    else summary = h("span", { class: "chip warn" }, `Λείπουν ${e.maxNeeded - shown} για όλα τα tiers (θέλει ${e.maxNeeded})`);

    return h("section", { class: "card" },
      h("h2", {}, "Element"),
      h("div", { class: "element-top" },
        h("div", { class: "big" }, img(d.class.elementIcon, null, d.class.element), num(shown)),
        summary,
        !d.promoted && e.maxNeededAfterPromotion > e.maxNeeded &&
          h("span", { class: "chip" }, `Μετά το promotion θέλει ${e.maxNeededAfterPromotion}`)),
      track,
      nextOne && h("div", { class: "small" },
        `Επόμενο όριο: ${nextOne.value} → ${nextOne.skill} T${nextOne.tier} ${nextOne.tierName}`),
      h("details", {}, h("summary", { class: "small muted" }, `Όλα τα όρια (${e.thresholds.length})`), list));
  }

  function statsCard(d) {
    const calc = d.calc || {};
    const rows = d.stats.order.map((key) => {
      const shown = d.stats.shown[key];
      const computed = calc.available ? (calc.stats || {})[key] : undefined;
      let calcCell = null;
      if (calc.available) {
        const match = computed != null && shown != null && agrees(computed, shown);
        calcCell = h("span", { class: "num calc " + (computed == null || shown == null ? "" : match ? "match" : "off") },
          fmtStat(key, computed));
      } else {
        calcCell = h("span", { class: "num calc" }, "—");
      }
      const s = STATS[key] || { label: key };
      return h("button", { class: "stat-btn", type: "button", onclick: () => openStat(d, key),
        "aria-label": `${s.label}: ${fmtStat(key, shown)}. Δες πώς βγαίνει` },
        h("span", { class: "name" }, s.label, s.long && h("small", {}, s.long)),
        h("span", { class: "num" }, fmtStat(key, shown)),
        calcCell);
    });
    let pill;
    if (calc.available) pill = h("span", { class: "right small", style: "color:var(--ok)" }, "calc έτοιμο");
    else pill = h("span", { class: "right small", style: "color:var(--warn)" }, calc.reason === "error" ? "calc: σφάλμα" : "calc όχι ακόμα");
    return h("section", { class: "card" },
      h("h2", {}, "Stats", pill),
      h("div", { class: "stats-head" }, h("span", {}, "Πάτα ένα stat για τις πράξεις"), h("span", {}, "Παιχνίδι"), h("span", {}, "calc")),
      rows);
  }

  function opText(op) {
    return { "*": "×", x: "×", "/": "÷" }[op] || op || "";
  }

  function openStat(d, key) {
    const s = STATS[key] || { label: key };
    const calc = d.calc || {};
    const shown = d.stats.shown[key];
    const body = [];
    const boxes = [h("div", {}, h("div", { class: "k" }, "Στο παιχνίδι"), h("div", { class: "v" }, fmtStat(key, shown)),
      shown == null && h("div", { class: "small muted" }, "δεν έχει διαβαστεί"))];
    if (calc.available) {
      const v = (calc.stats || {})[key];
      boxes.push(h("div", {}, h("div", { class: "k" }, "Υπολογισμός (calc)"), h("div", { class: "v" }, fmtStat(key, v)),
        v == null && h("div", { class: "small muted" }, "ο τύπος δεν βρέθηκε ακόμα")));
      if (v != null && shown != null) {
        const delta = v - shown;
        boxes.push(h("div", {}, h("div", { class: "k" }, "Διαφορά"),
          h("div", { class: "v", style: `color:var(${agrees(v, shown) ? "--ok" : "--warn"})` },
            (delta > 0 ? "+" : "") + num(delta))));
      }
    }
    body.push(h("div", { class: "compare" }, boxes));

    if (!calc.available) {
      if (calc.reason === "error") {
        body.push(h("div", { class: "note bad" }, "Το calc έβγαλε σφάλμα, οπότε δείχνω μόνο την τιμή του παιχνιδιού.",
          h("pre", { class: "err", text: calc.error || "" })));
      } else {
        body.push(h("div", { class: "note warn" },
          h("strong", {}, "Ο υπολογιστής δεν είναι έτοιμος ακόμα. "),
          "Τον φτιάχνει το session calc. Μόλις μπει στο calc/, εδώ θα φαίνεται κάθε βήμα της πράξης, " +
          "χωρίς restart του site. Τώρα δείχνω μόνο την τιμή που έδειξε το παιχνίδι."));
      }
    } else {
      if (calc.warnings && calc.warnings.length) {
        body.push(h("div", { class: "note warn" }, h("strong", {}, "Προσοχή (warnings του calc)"),
          h("ul", { class: "warnings" }, calc.warnings.map((w) => h("li", { text: w })))));
      }
      const steps = (calc.steps || []).filter((st) => st.stat === key);
      if (!steps.length) {
        body.push(h("div", { class: "note" }, `Το calc δεν έδωσε βήματα για ${s.label}.`));
      } else {
        body.push(h("table", { class: "steps" },
          h("thead", {}, h("tr", {}, h("th", {}, "#"), h("th", {}, "Βήμα"), h("th", {}, ""), h("th", { class: "num" }, "Τιμή"),
            h("th", { class: "num" }, "Σύνολο"))),
          h("tbody", {}, steps.map((st, i) => h("tr", { class: i === steps.length - 1 ? "final" : "" },
            h("td", { class: "muted" }, String(i + 1)),
            h("td", { text: st.label || "" }),
            h("td", { class: "op" }, opText(st.op)),
            h("td", { class: "num" }, num(st.value)),
            h("td", { class: "num" }, num(st.total)))))));
      }
    }
    ST.openPopup(`${s.label}${s.long ? " — " + s.long : ""} · ${d.name}`, body);
  }

  function statLine(stats) {
    const short = { attack: "ATK", defense: "DEF", hp: "HP" };
    return Object.entries(stats || {}).map(([k, v]) => `${short[k] || k} ${num(v)}`).join(" · ");
  }

  // a name that opens its popup (static/info.js); kind picks one when the name is also something else
  function infoName(name, kind, text) {
    return h("span", { class: "st-info", "data-info": name, "data-info-kind": kind, tabindex: "0", role: "button" }, text || name);
  }
  ST.infoName = infoName;

  function enchantRow(icon, name, chips, lines, kind) {
    return h("div", { class: "enchant" }, img(icon) || h("span"),
      h("div", {}, h("div", { class: "line" }, h("strong", {}, kind ? infoName(name, kind) : name), chips), lines));
  }

  function slotCard(s) {
    const types = h("span", { class: "type-list" },
      s.allowedTypes.map((t) => h("span", { title: t.name, style: "display:inline-flex;gap:3px;align-items:center" }, img(t.icon), t.name)));
    const head = h("div", { class: "slot-head" }, h("strong", {}, "Slot " + s.slot), " · ", types);
    if (s.state === "unknown") return h("div", { class: "slot unknown" }, head, h("div", { class: "muted" }, "Δεν έχει διαβαστεί ακόμα."));
    if (s.state === "empty") return h("div", { class: "slot empty" }, head, h("div", { class: "muted" }, "Άδειο."));

    const it = s.item;
    const q = it.quality || "Normal";
    const extras = [];
    if (s.starforged) extras.push(h("span", { class: "chip accent" }, "✦ Starforged"));
    if (s.transcendence) extras.push(h("span", { class: "chip accent" }, "Transcendence " + s.transcendence));
    if (it.fits === false) extras.push(h("span", { class: "chip warn" }, "Δεν μπαίνει σε αυτό το slot"));
    if (it.notFound) extras.push(h("span", { class: "chip warn" }, "Άγνωστο item"));
    if (it.innate && it.innate.element) extras.push(h("span", { class: "chip" }, "Ενσωματωμένο: " + it.innate.element));
    if (it.innate && it.innate.spirit) extras.push(h("span", { class: "chip" }, "Ενσωματωμένο: " + it.innate.spirit));
    const aff = [];
    if (it.affinity && it.affinity.elements.length) aff.push("element " + it.affinity.elements.join(", "));
    if (it.affinity && it.affinity.spirit) aff.push(it.affinity.spirit);

    const main = h("div", { class: "slot-main" },
      h("div", { class: "frame q-" + q, title: q },
        img(it.icon, "item", it.name),
        it.tier != null && h("span", { class: "tier" }, "T" + it.tier),
        img(it.qualityIcon, "q", q)),
      h("div", {},
        h("div", { class: "item-name q-text-" + q }, it.notFound ? it.name : infoName(it.name, "item")),
        h("div", { class: "muted small" }, [it.quality || "Quality άγνωστο", it.type].filter(Boolean).join(" · ")),
        it.stats && Object.keys(it.stats).length > 0 &&
          h("div", { class: "muted small", title: "Τα stats του item σε Normal quality, πριν από quality, enchants και skills" },
            "Βάση: " + statLine(it.stats)),
        aff.length > 0 && h("div", { class: "muted small" }, "Affinity: " + aff.join(" · ")),
        extras.length > 0 && h("div", { class: "chips" }, extras)));

    let el;
    const e = s.element;
    if (!e) el = h("div", { class: "enchant none" }, "Χωρίς element enchant");
    else if (e.notFound) el = enchantRow(null, e.name, h("span", { class: "chip warn" }, "Άγνωστο element"));
    else el = enchantRow(e.icon, e.name, [
      h("span", { class: "chip" }, img(e.typeIcon), "T" + e.tier + " · +" + e.amount),
      e.affinity && h("span", { class: "chip ok", title: "Το item έχει affinity σε αυτό το element" }, "✓ affinity"),
      !e.matchesClass && h("span", { class: "chip warn", title: "Άλλο element από της class" }, "άλλο element από την class"),
    ], h("div", { class: "eff muted" }, statLine(e.stats)), "element");

    let sp;
    const p = s.spirit;
    if (!p) sp = h("div", { class: "enchant none" }, "Χωρίς spirit");
    else if (p.notFound) sp = enchantRow(null, p.name, h("span", { class: "chip warn" }, "Άγνωστο spirit"));
    else {
      const other = p.affinity ? p.effect : p.effectWithAffinity;
      sp = enchantRow(p.icon, p.name, [
        h("span", { class: "chip" }, "T" + p.tier),
        p.affinity && h("span", { class: "chip ok", title: "Το item έχει affinity σε αυτό το spirit" }, "✓ affinity"),
      ], [
        h("div", { class: "eff", text: p.activeEffect || "" }),
        other && other !== p.activeEffect && h("div", { class: "eff muted" }, (p.affinity ? "Χωρίς affinity: " : "Με affinity: ") + other),
      ], "spirit");
    }
    return h("div", { class: "slot" }, head, main, el, sp);
  }

  function slotsCard(d) {
    return h("section", { class: "card" }, h("h2", {}, "Εξοπλισμός"), h("div", { class: "slots" }, d.slots.map(slotCard)));
  }

  function reviewPlaceholder() {
    return h("section", { id: "panel-review", class: "card placeholder", "data-panel": "review" },
      h("h2", {}, "Review / what-if"),
      h("p", { class: "muted", style: "margin:0" },
        "Εδώ θα μπει το review: τι να αλλάξεις σε κάθε slot, και πώς αλλάζουν τα stats αν βάλεις άλλο item " +
        "(προεπισκόπηση με το calc). Το φτιάχνει το session review."));
  }

  function renderHero(d, root) {
    root.replaceChildren(...[
      heroHeader(d),
      notesCard(d),
      h("div", { class: "grid-2" }, skillsCard(d), h("div", { style: "display:grid;gap:16px;align-content:start" }, statsCard(d), elementCard(d))),
      slotsCard(d),
      reviewPlaceholder(),
    ].filter(Boolean));
  }
  ST.kinds.hero = renderHero;
  // The hero view's parts, for other kinds (champions: web/ext/champions.js). d needs stats{order, shown}, calc, name.
  ST.statsCard = statsCard;
  ST.openStat = openStat;
  ST.slotCard = slotCard;
  ST.sourceText = sourceText;

  // --- page -----------------------------------------------------------------------------------------
  function setPills(sources, calc) {
    const src = sources && sources.hero;
    if (src) {
      const sp = $("#source-pill");
      sp.hidden = false;
      sp.className = "pill " + (src === "roster" ? "ok" : "warn");
      sp.textContent = src === "roster" ? "Ήρωες από το κινητό" : "Ήρωες από dowob";
      sp.title = src === "roster" ? "data/roster/heroes" : "data/heroes.json — το gear θα έρθει από το κινητό";
    }
    if (calc) {
      const cp = $("#calc-pill");
      cp.hidden = false;
      cp.className = "pill " + (calc.available ? "ok" : "warn");
      cp.textContent = calc.available ? "calc έτοιμο" : calc.reason === "error" ? "calc: σφάλμα" : "calc όχι ακόμα";
    }
  }

  function fillSelect(units) {
    const sel = $("#unit-select");
    const groups = {};
    for (const u of units) (groups[u.kind] = groups[u.kind] || []).push(u);
    sel.replaceChildren(...Object.entries(groups).map(([kind, list]) =>
      h("optgroup", { label: (ST.meta.kinds || {})[kind] || kind },
        list.map((u) => h("option", { value: u.kind + "/" + enc(u.id) },
          u.summary ? u.summary.label : u.name + (u.class ? " · " + u.class : "") + (u.level != null ? " · L" + u.level : ""))))));
  }

  let loadToken = 0;
  async function show(key) {
    const [kind, ...rest] = key.split("/");
    const id = decodeURIComponent(rest.join("/"));
    const token = ++loadToken;
    const root = $("#app");
    root.style.opacity = ".55";
    try {
      const d = await ST.api(`/api/unit/${enc(kind)}/${enc(id)}`);
      if (token !== loadToken) return;
      ST.current = d;
      const render = ST.kinds[kind];
      if (render) render(d, root);
      else root.replaceChildren(h("section", { class: "card" },
        h("div", { class: "note" }, `Δεν υπάρχει ακόμα προβολή για «${kind}».`),
        h("pre", { class: "err", text: JSON.stringify(d, null, 2) })));
      renderPanels(d);
      setPills(null, d.calc);
      $("#unit-select").value = key;
      try { localStorage.setItem("st-unit", key); } catch (e) { /* storage off */ }
      document.dispatchEvent(new CustomEvent("st:unit", { detail: d }));
    } catch (e) {
      if (token === loadToken) root.replaceChildren(h("div", { class: "note bad", text: "Σφάλμα: " + e.message }));
    } finally {
      if (token === loadToken) root.style.opacity = "";
    }
  }

  function loadScript(src) {
    return new Promise((resolve) => {
      const s = h("script", { src });
      s.onload = s.onerror = resolve;
      document.head.append(s);
    });
  }

  async function init() {
    initPopup();
    try {
      ST.meta = await ST.api("/api/meta");
      for (const src of ST.meta.ext || []) await loadScript(src);
      const res = await ST.api("/api/units");
      ST.units = res.units;
      setPills(res.sources, ST.meta.calc);
      if (!ST.units.length) {
        $("#app").replaceChildren(h("div", { class: "note warn" }, "Δεν βρέθηκαν ήρωες."));
        return;
      }
      fillSelect(ST.units);
      const keys = ST.units.map((u) => u.kind + "/" + enc(u.id));
      let saved = null;
      try { saved = localStorage.getItem("st-unit"); } catch (e) { /* storage off */ }
      const fromHash = location.hash.slice(1);
      const start = [fromHash, saved].find((k) => k && keys.includes(k)) || keys[0];
      $("#unit-select").addEventListener("change", (e) => { location.hash = e.target.value; });
      window.addEventListener("hashchange", () => {
        const k = location.hash.slice(1);
        if (keys.includes(k)) show(k);
      });
      if (location.hash.slice(1) !== start) history.replaceState(null, "", "#" + start);
      show(start);
    } catch (e) {
      $("#app").replaceChildren(h("div", { class: "note bad", text: "Δεν φόρτωσε το site: " + e.message }));
    }
  }

  init();
})();
