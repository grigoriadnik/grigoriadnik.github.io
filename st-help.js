// "What is this page?" box under the header of every page of the public site: what the page shows and how to
// read it, for players who meet the tool for the first time. Open on the first visit of each page, then it
// remembers whether the player closed it (localStorage «st-help:<page>»).
(function () {
  "use strict";
  const HELP = {
    "/": {
      title: "Heroes: one hero, slot by slot",
      body: [
        "Pick a hero at the top. Empty? Add heroes in <a href=\"/account/\">Account</a> and press Compute.",
        "<b>Skills</b>: each skill with its tier (T1–T4) and community rating. Higher element unlocks higher tiers.",
        "<b>Stats</b>: “Game” is what you typed, “calc” is the site's own calculation. Tap a stat to see the maths.",
        "<b>Equipment</b>: the 6 slots with item, quality, element and spirit. Tap any name for what it does.",
        "<b>Review / what-if</b> (bottom): how close the hero is to their best build, the recommended change per slot with its power gain and where to get it, and a what-if panel to try any change first.",
      ],
    },
    "/team": {
      title: "Team: your whole roster at a glance",
      body: [
        "Charts of all your heroes together: power now and after the plan, how close each is to their ceiling, gear quality per slot, missing enchants, and skill ratings.",
        "Each chart has a one-line takeaway under it and a table with the exact numbers. Hover or tap a bar for details.",
      ],
    },
    "/ext/bucket.html": {
      title: "Bucket list: what to gather, biggest win first",
      body: [
        "Everything the plan needs that you do not have yet: items to craft or buy, enchants, Titan Souls.",
        "<b>Groups</b> are upgrades (one hero slot or one promotion). A group is “ready” when you have everything it needs: then do that upgrade in the game.",
        "<b>Needed / Have / Missing</b>: type how many you already have; the list keeps your numbers when it is rebuilt.",
        "Order: power gained per missing piece, highest first. Switch to “craft first” for the cheapest wins.",
        "Where it says “phone” or “session”, read “your Account data”.",
      ],
    },
    "/account/": null, // the page explains itself
    "/guide/": null,
  };
  const path = location.pathname.replace(/index\.html$/, "");
  const help = HELP[path === "/team/" ? "/team" : path];
  if (!help) return;
  const key = "st-help:" + path;
  let closed = false;
  try { closed = localStorage.getItem(key) === "closed"; } catch (e) { /* private mode */ }

  const css = `.st-help{max-width:1200px;margin:12px auto 0;padding:0 16px;box-sizing:border-box}
  .st-help details{background:var(--accent-soft,#e6eefc);border:1px solid var(--line,#e2e5ea);border-radius:12px;padding:10px 14px}
  .st-help summary{cursor:pointer;font-weight:650}
  .st-help ul{margin:.5rem 0 .2rem;padding-left:1.2rem;line-height:1.5}
  .st-help a{color:var(--accent,#3b6fe0)}
  .st-help .more{font-size:.85rem;margin:.3rem 0 0}`;

  document.addEventListener("DOMContentLoaded", () => {
    const style = document.createElement("style");
    style.textContent = css;
    document.head.append(style);
    const wrap = document.createElement("div");
    wrap.className = "st-help";
    wrap.setAttribute("data-noinfo", "");
    wrap.setAttribute("data-no-i18n", "");
    wrap.innerHTML = `<details${closed ? "" : " open"}><summary>ⓘ What is this page? — ${help.title}</summary>
      <ul>${help.body.map((b) => `<li>${b}</li>`).join("")}</ul>
      <p class="more">More in the <a href="/guide/">Guide</a>.</p></details>`;
    wrap.querySelector("details").addEventListener("toggle", (e) => {
      try { localStorage.setItem(key, e.target.open ? "open" : "closed"); } catch (err) { /* ignore */ }
    });
    const nav = document.querySelector("[data-st-nav]");
    const sub = document.querySelector(".st-subbar");
    (sub || nav).after(wrap);
  });
})();
