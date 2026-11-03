"use strict";
// Champions (session `champions`): the view of one champion — rank, Titan Soul, leader skill and its party effect,
// Familiar and Aurasong with element and spirit, the stats with the calc steps popup. API: web/ext/champions.py.
(function () {
  const ST = window.ST;
  const h = ST.h;
  const num = ST.num;
  const SHORT = { attack: "ATK", defense: "DEF", hp: "HP", evasion: "EVA", critChance: "Crit", critDamage: "Crit Dmg", regen: "HP regen" };

  function header(d) {
    const c = d.champion || {};
    const chips = [];
    if (c.titanSoul) chips.push(h("span", { class: "chip accent", title: c.titanSoulInferred ? "Το παιχνίδι δεν το δείχνει: το βγάζει το calc από τα stats" : "" },
      "Titan Soul" + (c.titanSoulInferred ? " (από τα stats)" : "")));
    else chips.push(h("span", { class: "chip", title: "Το calc βγάζει από τα stats ότι δεν έχει Titan Soul" }, "Χωρίς Titan Soul"));
    if (d.cardLevel != null) chips.push(h("span", { class: "chip" }, "Card level " + d.cardLevel));
    chips.push(h("span", { class: "chip" }, ST.sourceText(d)));
    const seeds = c.seedsUsed
      ? `Seeds: HP ${num(c.seedsUsed.hp)} · ATK ${num(c.seedsUsed.attack)} · DEF ${num(c.seedsUsed.defense)}` +
        ((c.seedsInferred || []).length ? " (από τα stats)" : "")
      : null;
    return h("section", { class: "card" },
      h("div", { class: "hero-head" },
        d.element.icon ? h("img", { src: d.element.icon, class: "class-icon", alt: d.element.name || "" }) : h("span"),
        h("div", {},
          h("h1", { text: d.name }),
          h("div", { class: "sub" }, [d.title, d.classType, d.element.name].filter(Boolean).join(" · ")),
          h("div", { class: "chips" }, chips)),
        h("div", { class: "hero-meta" },
          h("div", { class: "muted small" }, "Level"),
          h("div", { class: "lvl", text: d.level != null ? d.level : "—" }),
          h("div", { class: "small", text: d.rank || "" }),
          seeds && h("div", { class: "muted small", text: seeds }))));
  }

  function effectText(e) {
    if (e.kind === "pct") return `+${num(e.value)}% ${SHORT[e.stat] || e.stat}`;
    if (e.kind === "add") return `+${num(e.value)}${e.stat === "critDamage" ? "%" : "%"} ${SHORT[e.stat] || e.stat}`;
    if (e.kind === "regen") return `+${num(e.value)} HP κάθε γύρο`;
    return e.text;
  }

  function leaderCard(d) {
    const L = (d.champion || {}).leader;
    if (!L) return h("section", { class: "card" }, h("h2", {}, "Leader skill"), h("p", { class: "muted" }, "—"));
    const stat = L.effects.filter((e) => e.kind !== "other");
    const other = L.effects.filter((e) => e.kind === "other");
    const tiers = h("ul", { class: "thresholds" }, L.tiers.map((t) => h("li", { class: t.reached ? "yes" : "no" },
      h("span", { class: "v", text: "T" + t.tier }), h("span", {}, t.reached ? "✓" : "·"),
      h("span", {}, h("strong", {}, t.name), " — " + t.text))));
    const shown = d.leaderShown && d.leaderShown.name;
    return h("section", { class: "card" },
      h("h2", {}, "Leader skill", h("span", { class: "right muted small" }, "για όλο το party")),
      h("div", { class: "skill" }, h("span"),
        h("div", {},
          h("div", { class: "title" }, L.name, h("span", { class: "tier-badge" }, "T" + L.tier)),
          h("div", { class: "desc", text: L.text }),
          d.leaderShown && d.leaderShown.quote && h("div", { class: "muted small", text: d.leaderShown.quote }),
          stat.length > 0 && h("div", { class: "chips" }, stat.map((e) => h("span", { class: "chip ok", title: e.text }, effectText(e)))),
          other.length > 0 && h("div", { class: "muted small" }, "Χωρίς stat (δεν μπαίνει στα νούμερα): " + other.map((e) => e.text).join(" · ")),
          shown && shown !== L.name && h("div", { class: "note warn small" }, `Το παιχνίδι έδειξε «${shown}», το rank δίνει «${L.name}».`),
          h("div", { class: "muted small" }, L.nextAtRank ? `Επόμενο tier στο rank ${L.nextAtRank}.` : "Στο max tier."))),
      h("p", { class: "muted small" }, "Το leader skill δεν μπαίνει στα stats του ίδιου του champion (ούτε στην οθόνη Info). " +
        "Στο power του παιχνιδιού μετράει με τρόπο που δεν βρέθηκε: δες το popup του Power."),
      h("details", {}, h("summary", { class: "small muted" }, "Όλα τα tiers"), tiers));
  }

  function rankCard(d) {
    const c = d.champion || {};
    const next = c.nextPowerUp || {};
    const shown = d.nextPowerUpShown && typeof d.nextPowerUpShown === "object" ? d.nextPowerUpShown : null;
    const rows = ["hp", "attack", "defense"].map((k) => h("tr", {},
      h("th", {}, SHORT[k]), h("td", { class: "num" }, next[k] != null ? "+" + num(next[k]) : "—"),
      h("td", { class: "num" }, shown && shown[k] != null ? "+" + num(shown[k]) : "—")));
    return h("section", { class: "card" },
      h("h2", {}, "Rank και element"),
      h("div", { class: "element-top" },
        h("div", { class: "big" }, d.element.icon ? h("img", { src: d.element.icon, alt: "" }) : null, num(d.element.shown)),
        h("span", { class: "chip" }, `${num(c.elementFromRank)} από το rank · ${num((c.elementComputed || 0) - (c.elementFromRank || 0))} από τα items`)),
      h("div", { class: "small" }, "Επόμενο Power Up:"),
      h("table", { class: "steps" }, h("thead", {}, h("tr", {}, h("th", {}, ""), h("th", { class: "num" }, "calc"), h("th", { class: "num" }, "παιχνίδι"))),
        h("tbody", {}, rows)),
      !shown && d.nextPowerUpShown && h("div", { class: "muted small" }, "Το παιχνίδι: «" + d.nextPowerUpShown + "» (διαβάστηκε ως κείμενο)."),
      c.titanSoul && h("p", { class: "muted small" }, "Με Titan Soul κάθε Power Up μετράει ×1,5 (και το rank σαν να είχε 2 Power Ups παραπάνω)."));
  }

  function notesCard(d) {
    const notes = (d.notes || []).map((n) => h("div", { class: "note warn", text: n }));
    return notes.length ? h("section", { class: "card" }, notes) : null;
  }

  function render(d, root) {
    root.replaceChildren(...[
      header(d),
      notesCard(d),
      h("div", { class: "grid-2" }, h("div", { style: "display:grid;gap:16px;align-content:start" }, leaderCard(d), rankCard(d)),
        h("div", { style: "display:grid;gap:16px;align-content:start" }, ST.statsCard(d))),
      h("section", { class: "card" }, h("h2", {}, "Εξοπλισμός"), h("div", { class: "slots" }, d.slots.map(ST.slotCard))),
      h("section", { id: "panel-review", class: "card placeholder", "data-panel": "review" }, h("h2", {}, "Review / what-if"),
        h("p", { class: "muted", style: "margin:0" }, "Φόρτωση…")),
    ].filter(Boolean));
  }

  ST.registerKind("champion", render);
})();
