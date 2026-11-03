/* The site header on every page (server.py puts it right after <body>): the sections as tabs, the current one
   marked, and the theme button (auto / light / dark, kept in localStorage "st-theme").
   A page's own info (its picker, status chips) goes in <div class="st-subbar"> under the header.
   STNav.add({id, label, href, order}) adds a section from a page's script (ST.nav on the heroes page);
   web/ext/<name>.py NAV = [...] adds one on every page, and every web/ext/<name>.html is one already.
   An older page header (header.topbar) is folded in: its chips with an id (or data-nav-keep) move to the sub-bar,
   the rest of it stays hidden (site.css). */
(() => {
  "use strict";
  if (window.STNav) return;
  const THEMES = ["auto", "light", "dark"];
  const NAMES = { auto: "αυτόματο", light: "ανοιχτό", dark: "σκούρο" };
  const header = document.querySelector("[data-st-nav]");
  if (!header) return;
  const tabs = header.querySelector(".st-tabs");
  const btn = document.getElementById("st-theme-btn");

  function theme() {
    try {
      const t = localStorage.getItem("st-theme");
      return THEMES.includes(t) ? t : "auto";
    } catch (e) {
      return "auto";
    }
  }

  function setTheme(t) {
    if (t === "auto") document.documentElement.removeAttribute("data-theme");
    else document.documentElement.setAttribute("data-theme", t);
    try { localStorage.setItem("st-theme", t); } catch (e) { /* storage off */ }
    btn.title = "Θέμα: " + NAMES[t];
    btn.setAttribute("aria-label", "Θέμα: " + NAMES[t] + ". Αλλαγή");
    document.dispatchEvent(new CustomEvent("st:theme", { detail: t }));
  }

  setTheme(theme());
  btn.addEventListener("click", () => setTheme(THEMES[(THEMES.indexOf(theme()) + 1) % THEMES.length]));

  function add(sec) {
    if (!sec || !sec.id || !sec.href || tabs.querySelector(`[data-id="${CSS.escape(sec.id)}"]`)) return;
    const order = sec.order == null ? 50 : sec.order;
    const a = document.createElement("a");
    a.className = "st-tab";
    a.href = sec.href;
    a.dataset.id = sec.id;
    a.dataset.order = order;
    a.textContent = sec.label || sec.id;
    const next = [...tabs.children].find((t) => Number(t.dataset.order) > order);
    tabs.insertBefore(a, next || null);
  }

  // the older header of a page that has not moved to .st-subbar yet
  const legacy = document.querySelector("body > header.topbar");
  if (legacy) {
    let sub = document.querySelector(".st-subbar");
    if (!sub) {
      sub = document.createElement("div");
      sub.className = "st-subbar";
      header.after(sub);
    }
    legacy.querySelectorAll(".pill[id], [data-nav-keep]").forEach((el) => sub.append(el));
    legacy.hidden = true;
  }

  // on a phone the current tab is scrolled into the strip
  const cur = tabs.querySelector('[aria-current="page"]');
  if (cur && tabs.scrollWidth > tabs.clientWidth) tabs.scrollLeft = cur.offsetLeft - tabs.clientWidth / 2 + cur.offsetWidth / 2;

  window.STNav = { add, setTheme };
  if (window.ST) window.ST.nav = window.STNav;
})();
