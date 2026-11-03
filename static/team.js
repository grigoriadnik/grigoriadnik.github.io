/* The «Ομάδα» page: the whole account at a glance, from GET /api/team (web/overview.py). Charts are inline SVG,
   redrawn to the card's width; every mark has a tooltip (hover or focus) and every chart a table. */
(() => {
  "use strict";
  const $ = (sel, root = document) => root.querySelector(sel);
  const SVGNS = "http://www.w3.org/2000/svg";
  const QUALITY_COLORS = { Normal: "--tm-q-normal", Superior: "--tm-q-superior", Flawless: "--tm-q-flawless", Epic: "--tm-q-epic", Legendary: "--tm-q-legendary" };

  function h(tag, attrs, ...kids) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v == null || v === false) continue;
      if (k === "class") el.className = v;
      else if (k === "text") el.textContent = v;
      else if (k === "style") el.style.cssText = v;
      else el.setAttribute(k, v === true ? "" : v);
    }
    for (const kid of kids.flat(Infinity)) {
      if (kid == null || kid === false || kid === "") continue;
      el.append(kid instanceof Node ? kid : String(kid));
    }
    return el;
  }

  function s(tag, attrs, ...kids) {
    const el = document.createElementNS(SVGNS, tag);
    for (const [k, v] of Object.entries(attrs || {})) if (v != null && v !== false) el.setAttribute(k, v);
    for (const kid of kids.flat(Infinity)) {
      if (kid == null || kid === false) continue;
      el.append(kid instanceof Node ? kid : document.createTextNode(String(kid)));
    }
    return el;
  }

  // --- numbers --------------------------------------------------------------------------------------
  const NF = new Intl.NumberFormat("el-GR");
  const num = (v) => (v == null ? "—" : NF.format(v));
  const pct = (v, d = 1) => (v == null ? "—" : new Intl.NumberFormat("el-GR", { minimumFractionDigits: d, maximumFractionDigits: d }).format(v) + "%");
  function compact(v) {
    if (v == null) return "—";
    const a = Math.abs(v);
    if (a >= 1e6) return new Intl.NumberFormat("el-GR", { maximumFractionDigits: 2 }).format(v / 1e6) + "M";
    if (a >= 1e3) return NF.format(Math.round(v / 1e3)) + "K";
    return NF.format(v);
  }
  const signed = (v, f = compact) => (v == null ? "—" : (v >= 0 ? "+" : "−") + f(Math.abs(v)));

  function niceTicks(max, count) {
    if (!max) return [0];
    const raw = max / count;
    const mag = Math.pow(10, Math.floor(Math.log10(raw)));
    const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((st) => st >= raw);
    const out = [0];
    while (out[out.length - 1] < max) out.push(out.length * step);
    return out;
  }

  // --- tooltip --------------------------------------------------------------------------------------
  const tip = $("#tm-tip");
  const tips = new WeakMap();

  function withTip(el, title, rows) {
    tips.set(el, { title, rows });
    el.setAttribute("data-tip", "");
    el.setAttribute("tabindex", "0");
    el.setAttribute("aria-label", [title].concat(rows.map((r) => `${r[1]}: ${r[0]}`)).join(". "));
    return el;
  }

  function showTip(el, x, y) {
    const t = tips.get(el);
    if (!t) return;
    tip.replaceChildren(h("div", { class: "t", text: t.title }),
      ...t.rows.map(([value, label, color]) => h("div", { class: "r" },
        h("i", { class: "key", style: color ? `background:${color}` : "background:transparent" }),
        h("b", { text: value }), h("span", { text: label }))));
    tip.hidden = false;
    const w = tip.offsetWidth;
    const ht = tip.offsetHeight;
    tip.style.left = Math.max(8, Math.min(x + 14, innerWidth - w - 8)) + "px";
    tip.style.top = (y + 14 + ht > innerHeight - 8 ? Math.max(8, y - ht - 10) : y + 14) + "px";
  }

  document.addEventListener("pointermove", (e) => {
    const el = e.target instanceof Element ? e.target.closest("[data-tip]") : null;
    if (el) showTip(el, e.clientX, e.clientY);
    else tip.hidden = true;
  });
  document.addEventListener("focusin", (e) => {
    const el = e.target instanceof Element ? e.target.closest("[data-tip]") : null;
    if (!el) { tip.hidden = true; return; }
    const r = el.getBoundingClientRect();
    showTip(el, r.left + Math.min(r.width / 2, 160), r.top + r.height / 2);
  });
  document.addEventListener("focusout", () => { tip.hidden = true; });
  addEventListener("scroll", () => { tip.hidden = true; }, { passive: true });

  // --- pieces ---------------------------------------------------------------------------------------
  const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

  function card(title, sub, body, note, table, wide) {
    // wide: the whole row (the long charts); the others pair up
    return h("section", { class: "card tm-card" + (wide ? " wide" : "") },
      h("h2", {}, title),
      sub && h("p", { class: "muted small tm-sub" }, sub),
      body,
      note && h("p", { class: "tm-note" }, h("strong", {}, "Τι σου λέει: "), note),
      table && h("details", { class: "tm-table" }, h("summary", {}, "Πίνακας"), h("div", {}, table)));
  }

  function table(head, rows) {
    return h("table", {},
      h("thead", {}, h("tr", {}, head.map(([label, isNum]) => h("th", { class: isNum ? "num" : null }, label)))),
      h("tbody", {}, rows.map((r) => h("tr", {}, r.map((v, i) => h("td", { class: head[i][1] ? "num" : null }, v))))));
  }

  // charts redraw to their width
  const charts = [];
  function chart(draw) {
    const box = h("div", { class: "tm-chart" });
    charts.push({ box, draw, width: 0 });
    return box;
  }
  function redraw() {
    for (const c of charts) {
      const w = Math.round(c.box.clientWidth);
      if (!w || w === c.width) continue;
      c.width = w;
      c.box.replaceChildren(c.draw(w));
    }
  }
  new ResizeObserver(() => redraw()).observe(document.body);

  // a bar from the baseline with a 4px round data-end
  function hbar(x0, y, w, bh, cls) {
    const r = Math.min(4, w, bh / 2);
    if (w <= 0) return null;
    return s("path", { class: cls, d: `M${x0},${y}h${w - r}a${r},${r} 0 0 1 ${r},${r}v${bh - 2 * r}a${r},${r} 0 0 1 ${-r},${r}h${-(w - r)}z` });
  }
  function vbar(x, y0, w, hgt, cls) {
    const r = Math.min(4, hgt, w / 2);
    if (hgt <= 0) return null;
    return s("path", { class: cls, d: `M${x},${y0}v${-(hgt - r)}a${r},${r} 0 0 1 ${r},${-r}h${w - 2 * r}a${r},${r} 0 0 1 ${r},${r}v${hgt - r}z` });
  }

  function legend(items) {
    return h("div", { class: "tm-legend" }, items.map(([kind, color, label]) => h("span", {},
      h("i", { class: "sw-" + kind, style: color ? `background:${color}` : null }), label)));
  }

  /* Ranked bars: now (bar), after plan (dot), ceiling (tick), one row per unit.
     rows: [{label, short, now, after, ceiling, tip: [title, rows]}] */
  function rankChart(rows, opts = {}) {
    return chart((W) => {
      const narrow = W < 520;
      const labelW = opts.labelW ? opts.labelW(narrow) : narrow ? 78 : 120;
      const valueW = 52; // the «now» values in a column of their own at the right
      const rowH = 26;
      const bh = 12;
      const top = 22;
      const x0 = labelW;
      const pw = Math.max(40, W - labelW - valueW - 12);
      const max = Math.max(...rows.map((r) => Math.max(r.now || 0, r.after || 0, r.ceiling || 0))) || 1;
      const ticks = niceTicks(max, 5);
      const xmax = ticks[ticks.length - 1];
      const X = (v) => x0 + (v / xmax) * pw;
      const H = top + rows.length * rowH + 4;
      const svg = s("svg", { viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": opts.aria || "" });
      svg.append(s("text", { class: "muted", x: W - 2, y: 12, "text-anchor": "end" }, "τώρα"));
      ticks.forEach((t, i) => {
        svg.append(s("line", { class: t === 0 ? "axis" : "grid", x1: X(t), x2: X(t), y1: top - 4, y2: H }));
        if (!narrow || i % 2 === 0) svg.append(s("text", { class: "muted", x: X(t), y: 12, "text-anchor": t === 0 ? "start" : "middle" }, compact(t)));
      });
      rows.forEach((r, i) => {
        const y = top + i * rowH + (rowH - bh) / 2;
        const g = s("g", { class: "row" });
        g.append(s("text", { x: labelW - 8, y: y + bh / 2 + 4, "text-anchor": "end" }, narrow && r.short ? r.short : r.label));
        if (r.now) g.append(hbar(x0, y, X(r.now) - x0, bh, "s1"));
        if (r.ceiling) g.append(s("line", { class: "ceil", x1: X(r.ceiling), x2: X(r.ceiling), y1: y - 3, y2: y + bh + 3 }));
        if (r.after) g.append(s("circle", { class: "s2", cx: X(r.after), cy: y + bh / 2, r: 5 }));
        g.append(s("text", { class: "muted", x: W - 2, y: y + bh / 2 + 4, "text-anchor": "end" }, compact(r.now)));
        g.append(withTip(s("rect", { class: "hit", x: 0, y: top + i * rowH, width: W, height: rowH, rx: 4 }), r.tip[0], r.tip[1]));
        svg.append(g);
      });
      return svg;
    });
  }

  /* Plain bars, one series: rows [{label, icon?, value, tip}] against max. */
  function barList(rows, max, fmt, opts = {}) {
    return chart((W) => {
      const labelW = opts.labelW || 96;
      const valueW = 40;
      const rowH = opts.rowH || 24;
      const bh = 12;
      const pw = Math.max(40, W - labelW - valueW);
      const X = (v) => labelW + (v / (max || 1)) * pw;
      const H = rows.length * rowH + 2;
      const svg = s("svg", { viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": opts.aria || "" });
      svg.append(s("line", { class: "axis", x1: labelW, x2: labelW, y1: 0, y2: H }));
      if (opts.limit != null) svg.append(s("line", { class: "limit", x1: X(opts.limit), x2: X(opts.limit), y1: 0, y2: H }));
      rows.forEach((r, i) => {
        const y = i * rowH + (rowH - bh) / 2;
        const g = s("g", { class: "row" });
        let tx = labelW - 8;
        if (r.icon) {
          g.append(s("image", { href: r.icon, x: labelW - 24, y: y - 2, width: 16, height: 16 }));
          tx = labelW - 30;
        }
        g.append(s("text", { x: tx, y: y + bh / 2 + 4, "text-anchor": "end" }, r.label));
        g.append(hbar(labelW, y, X(r.value || 0) - labelW, bh, "s1"));
        g.append(s("text", { class: "muted", x: X(r.value || 0) + 6, y: y + bh / 2 + 4 }, fmt(r.value)));
        g.append(withTip(s("rect", { class: "hit", x: 0, y: i * rowH, width: W, height: rowH, rx: 4 }), r.tip[0], r.tip[1]));
        svg.append(g);
      });
      return svg;
    });
  }

  /* Columns, one series: rows [{label, value, tip}]. */
  function columns(rows, opts = {}) {
    return chart((W) => {
      const H = 150;
      const base = H - 22;
      const top = 18;
      const band = W / rows.length;
      const bw = Math.min(24, band * 0.6);
      const max = Math.max(...rows.map((r) => r.value), 1);
      const Y = (v) => (v / max) * (base - top);
      const svg = s("svg", { viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": opts.aria || "" });
      svg.append(s("line", { class: "axis", x1: 0, x2: W, y1: base, y2: base }));
      rows.forEach((r, i) => {
        const cx = band * i + band / 2;
        const g = s("g", { class: "row" });
        g.append(vbar(cx - bw / 2, base, bw, Y(r.value), "s1"));
        g.append(s("text", { class: "muted", x: cx, y: base - Y(r.value) - 6, "text-anchor": "middle" }, num(r.value)));
        g.append(s("text", { x: cx, y: H - 6, "text-anchor": "middle" }, r.label));
        g.append(withTip(s("rect", { class: "hit", x: band * i, y: 0, width: band, height: H, rx: 4 }), r.tip[0], r.tip[1]));
        svg.append(g);
      });
      return svg;
    });
  }

  /* One 100% bar of parts with a 2px surface gap: parts [{label, value, color}]. */
  function stack(parts, total) {
    return chart((W) => {
      const bh = 30;
      const gap = 2;
      const shown = parts.filter((p) => p.value > 0);
      const room = W - gap * (shown.length - 1);
      const svg = s("svg", { viewBox: `0 0 ${W} ${bh}`, role: "img", "aria-label": "Slots ανά quality" });
      const clip = "tm-clip-" + Math.random().toString(36).slice(2);
      svg.append(s("defs", {}, s("clipPath", { id: clip }, s("rect", { x: 0, y: 0, width: W, height: bh, rx: 4 }))));
      const g = s("g", { "clip-path": `url(#${clip})` });
      let x = 0;
      for (const p of shown) {
        const w = (p.value / total) * room;
        const color = css(p.color) || "#888";
        const seg = s("g", { class: "row" });
        seg.append(s("rect", { x, y: 0, width: w, height: bh, style: `fill:var(${p.color})` }));
        const text = num(p.value);
        if (w >= text.length * 8 + 12) {
          seg.append(s("text", { class: "seg-label", x: x + w / 2, y: bh / 2 + 4, "text-anchor": "middle", style: `fill:${inkOn(color)}` }, text));
        }
        seg.append(withTip(s("rect", { class: "hit", x, y: 0, width: w + gap, height: bh }), p.label,
          [[num(p.value), "slots", `var(${p.color})`], [pct((100 * p.value) / total), "του συνόλου"]]));
        g.append(seg);
        x += w + gap;
      }
      svg.append(g);
      return svg;
    });
  }

  // white or near-black text on a fill, whichever reads better
  function inkOn(color) {
    const m = /^#?([0-9a-f]{6})$/i.exec(color.trim());
    if (!m) return "#ffffff";
    const c = [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)));
    const L = 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
    return (1.05 / (L + 0.05)) >= ((L + 0.05) / (0.0036 + 0.05)) ? "#ffffff" : "#0b0b0b";
  }

  // --- the sections ---------------------------------------------------------------------------------

  function headline(d) {
    const t = d.totals;
    const today = t.now != null && t.before != null ? t.now - t.before : null;
    const plan = t.afterPlan != null && t.now != null ? t.afterPlan - t.now : null;
    const tile = (cls, k, v, dline) => h("div", { class: "tm-tile " + cls }, h("div", { class: "k" }, k), h("div", { class: "v" }, v), dline && h("div", { class: "d" }, dline));
    const notes = [];
    if (today != null) notes.push(`σήμερα η ομάδα ανέβηκε ${signed(today)} (${pct((100 * today) / t.before)})`);
    if (plan != null) notes.push(`με όλο το πλάνο ανεβαίνει άλλο ${signed(plan)} (${pct((100 * plan) / t.now)})`);
    const w = d.coverage.waiting.length;
    if (w && t.promotionGain) notes.push(`και τα ${w} promotions δίνουν ακόμα ${signed(t.promotionGain)} όταν βρεθούν Titan Soul`);
    return card("Η ομάδα", `${t.heroes} ήρωες · power όπως το δείχνει το παιχνίδι`,
      h("div", { class: "tm-heads" },
        tile("hero", "Power ομάδας τώρα", compact(t.now),
          today != null && [h("span", { class: "up" }, "▲ " + signed(today)), " σήμερα"]),
        tile("", "Πριν από σήμερα", compact(t.before), t.before != null && "πριν από τα σημερινά βήματα"),
        tile("", "Μετά το πλάνο", compact(t.afterPlan), plan != null && [h("span", { class: "up" }, "▲ " + signed(plan)), " · χωρίς promotions"]),
        tile("", "Μέσο review %", pct(t.avgPct), t.avgAfterPlanPct != null && `${pct(t.avgAfterPlanPct)} μετά το πλάνο`)),
      notes.length ? notes.join(", ") + "." : null,
      table([["", false], ["Power", true]], [
        ["Τώρα", num(t.now)], ["Πριν από σήμερα", num(t.before)], ["Μετά το πλάνο (bucket)", num(t.afterPlan)],
        ["Promotions που περιμένουν", num(t.promotionGain)], ["Μέσο review %", pct(t.avgPct)], ["Μέσο review % μετά το πλάνο", pct(t.avgAfterPlanPct)]]),
      true);
  }

  function powerCard(d, kind) {
    const champs = kind === "champion";
    const list = (champs ? d.champions : d.heroes).slice().sort((a, b) => (b.now || 0) - (a.now || 0));
    const c1 = "var(--tm-s1)";
    const c2 = "var(--tm-s2)";
    const rows = list.map((u) => ({
      label: champs ? u.id.split(" and ")[0] + " · " + (u.rank || "").replace("Rank ", "R") : u.id,
      short: champs ? u.id.split(" and ")[0] : u.id.replace("Hero ", "N"),
      now: u.now, after: u.afterPlan, ceiling: u.ceiling,
      tip: [u.id + (u.class ? " · " + u.class : "") + (u.rank ? " · " + u.rank : ""), [
        [num(u.now), "τώρα", c1],
        [num(u.afterPlan) + (u.afterPlan && u.now ? ` (${signed(u.afterPlan - u.now)})` : ""), "μετά το πλάνο", c2],
        [num(u.ceiling), "ταβάνι"],
        [pct(u.pct) + " → " + pct(u.afterPlanPct), "review %"],
      ]],
    }));
    const gains = list.filter((u) => u.afterPlan && u.now).map((u) => [u, u.afterPlan - u.now]).sort((a, b) => b[1] - a[1]);
    const near = list.filter((u) => (u.afterPlanPct || 0) >= 98).length;
    const room = list.filter((u) => u.ceiling && u.now).map((u) => [u, u.ceiling - u.now]).sort((a, b) => b[1] - a[1]);
    let note;
    if (champs) {
      const avg = list.reduce((a, u) => a + (u.pct || 0), 0) / (list.length || 1);
      note = `μέσο review % των champions ${pct(avg)}· το μεγαλύτερο περιθώριο έχει ο ${room[0] ? room[0][0].id + " (" + signed(room[0][1]) + " ως το ταβάνι)" : "—"}.`;
    } else {
      note = (gains[0] ? `το μεγαλύτερο κέρδος του πλάνου είναι στον ${gains[0][0].id} (${signed(gains[0][1])})` : "") +
        `· μετά το πλάνο ${near} από τους ${list.length} είναι στο 98% του ταβανιού τους ή πάνω.`;
    }
    return card(champs ? "Champions: power και rank" : "Power ανά ήρωα",
      "Μπάρα: τώρα (παιχνίδι) · κουκκίδα: μετά το πλάνο · γραμμή: ταβάνι (καλύτερο δυνατό με τα σημερινά skills)",
      [legend([["bar", c1, "Τώρα"], ["dot", c2, "Μετά το πλάνο"], ["line", null, "Ταβάνι"]]),
        rankChart(rows, { aria: champs ? "Power ανά champion" : "Power ανά ήρωα", labelW: champs ? (n) => (n ? 70 : 130) : null })],
      note,
      table([[champs ? "Champion" : "Ήρωας", false], ["Class", false], champs ? ["Rank", false] : ["Level", true],
        ["Τώρα", true], ["Μετά το πλάνο", true], ["Ταβάνι", true], ["Review %", true], ["Μετά %", true]],
      list.map((u) => [u.id, u.class || "—", champs ? u.rank || "—" : num(u.level), num(u.now), num(u.afterPlan), num(u.ceiling), pct(u.pct), pct(u.afterPlanPct)])),
      true);
  }

  function gearCard(d) {
    const total = d.qualities.reduce((a, q) => a + q.count, 0);
    const parts = d.qualities.map((q) => ({ label: q.quality, value: q.count, color: QUALITY_COLORS[q.quality] || "--muted" }));
    const top = d.qualities.filter((q) => q.quality === "Epic" || q.quality === "Legendary").reduce((a, q) => a + q.count, 0);
    const normal = (d.qualities.find((q) => q.quality === "Normal") || {}).count || 0;
    const e = d.enchants;
    const meter = (label, n, of) => h("div", { class: "tm-meter" }, h("span", {}, label), h("strong", {}, `${num(n)} από ${num(of)}`),
      h("div", { class: "bar", role: "img", "aria-label": `${label}: ${n} από ${of}` }, h("i", { style: `width:${of ? (100 * n) / of : 0}%` })));
    return card("Gear: quality στα slots", `${num(total)} slots (6 ανά ήρωα) με item`,
      [stack(parts, total),
        h("div", { class: "tm-legend" }, parts.map((p) => h("span", {}, h("i", { class: "sw-bar", style: `background:var(${p.color})` }),
          p.label, " ", h("b", {}, num(p.value)), ` (${pct((100 * p.value) / (total || 1), 0)})`))),
        h("div", { class: "tm-meters" }, meter("Slots χωρίς element", e.noElement, e.slots - e.empty), meter("Slots χωρίς spirit", e.noSpirit, e.slots - e.empty))],
      `${num(top)} από τα ${num(total)} slots είναι Epic ή Legendary (${pct((100 * top) / (total || 1), 0)}) και ${num(normal)} είναι ακόμα Normal· element λείπει από ${num(e.noElement)} και spirit από ${num(e.noSpirit)}.`,
      table([["Quality", false], ["Slots", true], ["%", true]], parts.map((p) => [p.label, num(p.value), pct((100 * p.value) / (total || 1))])
        .concat([["Χωρίς element", num(e.noElement), ""], ["Χωρίς spirit", num(e.noSpirit), ""], ["Άδεια", num(e.empty), ""]])));
  }

  function skillsCard(d) {
    const n = d.ratings.reduce((a, r) => a + r.count, 0);
    const c1 = "var(--tm-s1)";
    const sCount = d.ratings.filter((r) => r.rating === "S" || r.rating === "S+").reduce((a, r) => a + r.count, 0);
    const weakSkills = d.heroes.filter((x) => x.ratings.some((r) => ["B", "C", "D"].includes(r)))
      .map((x) => `${x.id} (${x.ratings.join("/")})`);
    const strong = d.heroes.filter((x) => x.strength != null).slice().sort((a, b) => b.strength - a.strength);
    const weakSets = strong.filter((x) => x.strength < 0.5).map((x) => x.id);
    return card("Skills", "Rating των skills που έχουν οι ήρωες (Default skill set) και πόσο δυνατό είναι το σετ κάθε ήρωα",
      h("div", { class: "tm-two" },
        h("div", {}, h("h3", {}, `Ratings (${num(n)} skills)`),
          columns(d.ratings.map((r) => ({ label: r.rating, value: r.count, tip: [`Rating ${r.rating}`, [[num(r.count), "skills", c1], [pct((100 * r.count) / (n || 1)), "του συνόλου"]]] })),
            { aria: "Skills ανά rating" })),
        h("div", {}, h("h3", {}, "Δύναμη skill set (100% = δεν βγαίνει καλύτερο με reroll)"),
          barList(strong.map((x) => ({ label: x.id.replace("Hero ", "N"), value: Math.round(100 * x.strength),
            tip: [x.id + " · " + x.class, [[pct(100 * x.strength, 0), "δύναμη σετ", c1], [x.ratings.join(" / ") || "—", "ratings"]]] })),
          100, (v) => v + "%", { labelW: 44, rowH: 18, limit: 50, aria: "Δύναμη skill set ανά ήρωα" }))),
      `${num(sCount)} από τα ${num(n)} skills είναι S (${pct((100 * sCount) / (n || 1), 0)})` +
        (weakSkills.length ? `· με B ή χαμηλότερο: ${weakSkills.join(", ")}` : "") +
        `. Κάτω από το 50% (η γραμμή, εκεί που το review λέει «αδύναμο σετ»): ${weakSets.length ? weakSets.join(", ") : "κανένας"}.`,
      table([["Ήρωας", false], ["Class", false], ["Ratings", false], ["Δύναμη σετ", true]],
        strong.map((x) => [x.id, x.class, x.ratings.join(" / ") || "—", pct(100 * x.strength, 0)])), true);
  }

  function coverageCard(d) {
    const c = d.coverage;
    const n = d.heroes.length;
    const c1 = "var(--tm-s1)";
    const rowsOf = (list, icon) => list.map((x) => ({ label: x.key, icon: icon ? x.icon : null, value: x.count,
      tip: [x.key, [[num(x.count), "ήρωες", c1], [pct((100 * x.count) / (n || 1), 0), "της ομάδας"]]] }));
    const promo = [{ key: "Promoted", count: c.promoted.yes }, { key: "Χωρίς", count: c.promoted.no }];
    const gain = c.waiting.reduce((a, w) => a + (w.gain || 0), 0);
    const q = d.quests;
    const questLine = q.top && q.weakest
      ? (q.weakest.now >= q.top.minimumPower
        ? ` Quests: ακόμα και ο πιο αδύναμος (${q.weakest.id}, ${compact(q.weakest.now)}) ξεπερνά το μεγαλύτερο Minimum Power (${num(q.top.minimumPower)}, ${q.top.area} ${q.top.difficulty})· το Minimum Power λέει μόνο ότι μπαίνεις, όχι ότι κερδίζεις.`
        : ` Quests: ο ${q.weakest.id} (${compact(q.weakest.now)}) είναι κάτω από το μεγαλύτερο Minimum Power (${num(q.top.minimumPower)}).`)
      : "";
    return card("Κάλυψη ομάδας", "Class type, element της class και promotion",
      h("div", { class: "tm-two" },
        h("div", {}, h("h3", {}, "Class type"), barList(rowsOf(c.classTypes), n, num, { aria: "Ήρωες ανά class type" })),
        h("div", {}, h("h3", {}, "Element"), barList(rowsOf(c.elements, true), n, num, { aria: "Ήρωες ανά element" })),
        h("div", {}, h("h3", {}, "Promotion"), barList(rowsOf(promo), n, num, { aria: "Promoted ή όχι" }))),
      `${c.classTypes.map((t) => `${t.count} ${t.key}`).join(", ")}. ` +
        (c.waiting.length ? `${c.waiting.length} ήρωες περιμένουν promotion (${signed(gain)} power): θέλουν ${c.waiting.length} Titan Soul και έχεις ${num(c.titanSouls)}.` : "Όλοι έχουν promotion.") +
        questLine,
      table([["Ήρωας", false], ["Class", false], ["Type", false], ["Element", false], ["Promotion", false]],
        d.heroes.map((x) => [x.id, x.class, x.classType || "—", x.element || "—",
          x.promoted ? "✓" : x.promotesTo ? `→ ${x.promotesTo} (${signed(x.promotionGain)})` : "—"])));
  }

  // --- the page -------------------------------------------------------------------------------------

  async function load() {
    const root = $("#team");
    let d;
    try {
      const r = await fetch("/api/team");
      d = await r.json();
      if (!r.ok) throw new Error(d.error || "HTTP " + r.status);
    } catch (e) {
      root.replaceChildren(h("div", { class: "note bad", text: "Δεν φόρτωσε η ομάδα: " + e.message }));
      return;
    }
    const stamp = $("#tm-stamp");
    if (d.reviewAt) {
      stamp.textContent = "Review " + new Date(d.reviewAt).toLocaleString("el-GR", { dateStyle: "short", timeStyle: "short" });
      stamp.hidden = false;
    }
    charts.length = 0;
    root.replaceChildren(h("div", { class: "tm-grid" },
      headline(d), powerCard(d, "hero"), gearCard(d), coverageCard(d), skillsCard(d), powerCard(d, "champion")));
    redraw();
  }

  // the label ink inside the quality bar is picked per colour: a theme change redraws
  const again = () => { for (const c of charts) c.width = 0; redraw(); };
  document.addEventListener("st:theme", again);
  matchMedia("(prefers-color-scheme: dark)").addEventListener("change", again);
  load();
})();
