// English for the public site. Every Greek fragment of the code (public/i18n/en.json → /i18n/en.js, ST_EN) is
// replaced wherever it shows up in the page: text, title/placeholder/aria-label, the tab title, alert/confirm.
// Text built from several literals and numbers is translated piece by piece, the longest fragment first, so the
// site's own code (web/, review/, bucket/…) stays as it is. Numbers go from 1.234,5 to 1,234.5.
// The guild reads English only (owner, 2026-11-03): no language switch.
(function () {
  "use strict";
  const GREEK = /[Ͱ-Ͽἀ-῿]/;
  const lang = "en";
  document.documentElement.lang = lang;

  let translate = (s) => s;
  if (lang === "en") {
    const map = window.ST_EN || {};
    const keys = Object.keys(map).filter((k) => map[k]).sort((a, b) => b.length - a.length);
    const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    // a fragment that starts or ends with a Greek letter matches only as whole words
    const alt = keys.map((k) => (GREEK.test(k[0]) ? "(?<![\\u0370-\\u03ff\\u1f00-\\u1fff])" : "") + esc(k) +
                                (GREEK.test(k[k.length - 1]) ? "(?![\\u0370-\\u03ff\\u1f00-\\u1fff])" : ""));
    const big = alt.length ? new RegExp(alt.join("|"), "g") : null;
    const lookup = new Map(keys.map((k) => [k, map[k]]));
    const numbers = /[1-9]\d{0,2}(?:\.\d{3})+(?:,\d+)?|\b\d+,\d+\b/g;
    translate = function (s) {
      if (!s || !GREEK.test(s)) return s;
      let out = big ? s.replace(big, (m) => lookup.get(m) ?? m) : s;
      out = out.replace(numbers, (n) => n.replace(/[.,]/g, (c) => (c === "." ? "," : ".")));
      out = out.replace(/«/g, "“").replace(/»/g, "”").replace(/ μ\.μ\./g, " PM").replace(/ π\.μ\./g, " AM");
      return FIXES.reduce((t, [re, to]) => t.replace(re, to), out);
    };
    // English-only touch-ups of what the code prints around values (an empty slot prints as "None")
    const FIXES = [[/ instead of None \(None\)/g, " in the empty slot"], [/\bNone \(None\)/g, "empty slot"]];
    // Numbers on their own (a table cell, a gain) come from Greek formatting too: 346.597 → 346,597, 74,1% → 74.1%.
    // Text the public site writes itself in English (account page, guide, panels) sits in [data-no-i18n].
    function numbers2(s) { return s.replace(numbers, (n) => n.replace(/[.,]/g, (c) => (c === "." ? "," : "."))); }

    const SKIP = new Set(["SCRIPT", "STYLE", "TEXTAREA", "INPUT", "CODE", "PRE"]);
    const ATTRS = ["title", "placeholder", "aria-label", "alt"];
    const done = new WeakMap(); // text node → what we wrote, so a node is not translated twice
    function text(node) {
      if (done.get(node) === node.data) return;
      const greek = GREEK.test(node.data);
      // a number on its own (a table cell, a gain) is still Greek-formatted; a piece of English text with letters
      // is a part of a node already translated (info.js splits nodes to link names), so it is left alone
      // («9,2%» is Greek whatever surrounds it: English never writes a percentage with a comma)
      const pctOnly = !greek && /[A-Za-z]/.test(node.data);
      if (!greek && !/\d[.,]\d/.test(node.data)) return;
      const p = node.parentNode;
      if (p && (SKIP.has(p.nodeName) || (p.closest && p.closest("[data-no-i18n]")))) return;
      const t = greek ? translate(node.data) : pctOnly ? node.data.replace(/(\d),(\d{1,2})(?=\s*%)/g, "$1.$2")
        : numbers2(node.data);
      done.set(node, t);
      if (t !== node.data) node.data = t;
    }
    const doneAttr = new WeakMap(); // element → {attribute: what we wrote}, same reason
    function attrs(el) {
      if (!el.getAttribute) return;
      for (const a of ATTRS) {
        const v = el.getAttribute(a);
        if (!v || !GREEK.test(v)) continue;
        const mine = doneAttr.get(el) || {};
        if (mine[a] === v) continue;
        mine[a] = translate(v);
        doneAttr.set(el, mine);
        if (mine[a] !== v) el.setAttribute(a, mine[a]);
      }
    }
    function walk(root) {
      if (root.nodeType === 3) return text(root);
      if (root.nodeType !== 1 && root.nodeType !== 9 && root.nodeType !== 11) return;
      if (root.nodeType === 1) { if (SKIP.has(root.nodeName) && root.nodeName !== "INPUT") return; attrs(root); }
      const it = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
      for (let n = it.nextNode(); n; n = it.nextNode()) (n.nodeType === 3 ? text(n) : attrs(n));
    }
    let titleOut = null; // what we wrote, so a title still holding Greek is not translated again and again
    function title() {
      if (document.title === titleOut || !GREEK.test(document.title)) return;
      titleOut = translate(document.title);
      document.title = titleOut;
    }
    const obs = new MutationObserver((records) => {
      for (const r of records) {
        if (r.type === "characterData") text(r.target);
        else if (r.type === "attributes") attrs(r.target);
        else r.addedNodes.forEach(walk);
      }
      title();
    });
    obs.observe(document.documentElement, { childList: true, subtree: true, characterData: true,
                                            attributes: true, attributeFilter: ATTRS });
    walk(document.documentElement);
    title();
    for (const fn of ["alert", "confirm", "prompt"]) {
      const orig = window[fn].bind(window);
      window[fn] = (msg, ...rest) => orig(translate(String(msg ?? "")), ...rest);
    }
  }

  window.STLang = { lang, t: translate };
})();
