/* Tsugi — resale price comparison (prototype). Plain JS, no build step. */
(function () {
  "use strict";
  const { SHOPS, ITEMS } = window.TSUGI_DATA;
  const T = window.TSUGI_I18N;

  // ---------- constants ----------
  const GR = { S: 0, A: 1, AB: 2, B: 3, C: 4 };
  const GRADES = ["S", "A", "AB", "B", "C"];
  // Demo exchange rates: units of currency per 1 JPY (fixed for the prototype)
  const RATE = { JPY: 1, USD: 0.0066, EUR: 0.0061, GBP: 0.0052, CNY: 0.047, KRW: 9.3, TWD: 0.21, HKD: 0.051, SGD: 0.0088, AUD: 0.0101, THB: 0.22 };
  const SYM = { JPY: "¥", USD: "$", EUR: "€", GBP: "£", CNY: "CN¥", KRW: "₩", TWD: "NT$", HKD: "HK$", SGD: "S$", AUD: "A$", THB: "฿" };
  // Destination -> shipping zone; zone multiplies the shop's base (Asia) fee
  const DEST = { US: "na", CA: "na", GB: "eu", FR: "eu", DE: "eu", IT: "eu", AU: "oc", SG: "asia", HK: "asia", TW: "asia", KR: "asia", CN: "asia", TH: "asia" };
  const DEST_NAME = { US: "United States", CA: "Canada", GB: "United Kingdom", FR: "France", DE: "Germany", IT: "Italy", AU: "Australia", SG: "Singapore", HK: "Hong Kong", TW: "Taiwan", KR: "South Korea", CN: "China", TH: "Thailand" };
  const DEST_NAME_JA = { US: "アメリカ", CA: "カナダ", GB: "イギリス", FR: "フランス", DE: "ドイツ", IT: "イタリア", AU: "オーストラリア", SG: "シンガポール", HK: "香港", TW: "台湾", KR: "韓国", CN: "中国", TH: "タイ" };
  const ZONE_X = { asia: 1, na: 1.5, eu: 1.6, oc: 1.4 };
  const REFUND_MIN = 5000; // JPY before tax, general goods

  // Whole days from a YYYY-MM-DD listing date to today (local time); unknown date -> null
  function daysSince(d) {
    if (!d) return null;
    const [y, m, day] = d.split("-").map(Number);
    const now = new Date();
    return Math.max(0, Math.round((Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) - Date.UTC(y, m - 1, day)) / 864e5));
  }

  // Expand offer tuples once
  ITEMS.forEach(it => {
    it.offers = it.offers.map(([s, g, p, pickup, ship, fee, acc, listed]) => ({ s, g, p, pickup: !!pickup, ship: !!ship, fee, acc, days: daysSince(listed) }));
    it.minIncl = Math.min(...it.offers.map(o => o.p));
  });

  // ---------- state ----------
  const st = {
    lang: (navigator.language || "").startsWith("ja") ? "ja" : "en",
    cur: "JPY", mode: "visitor", dest: "US",
    q: "", cat: "", brands: new Set(), shops: new Set(), grade: "", pmin: "", pmax: "", withBox: false,
    sort: "low", showFilters: false,
    watch: {}, recent: []
  };
  const store = {
    get() { try { return JSON.parse(localStorage.getItem("tsugi.v2") || "{}"); } catch (_) { return {}; } },
    set() { try { localStorage.setItem("tsugi.v2", JSON.stringify({ lang: st.lang, cur: st.cur, mode: st.mode, dest: st.dest, watch: st.watch, recent: st.recent })); } catch (_) {} }
  };
  (function load() {
    const s = store.get();
    ["lang", "cur", "mode", "dest"].forEach(k => { if (s[k]) st[k] = s[k]; });
    if (s.watch && typeof s.watch === "object") st.watch = s.watch;
    if (Array.isArray(s.recent)) st.recent = s.recent.filter(id => ITEMS.some(i => i.id === id));
    if (!RATE[st.cur]) st.cur = "JPY";
    if (!DEST[st.dest]) st.dest = "US";
    if (!["visitor", "resident", "ship"].includes(st.mode)) st.mode = "visitor";
  })();

  // ---------- helpers ----------
  const $ = id => document.getElementById(id);
  const t = k => T[st.lang][k];
  const ja = () => st.lang === "ja";
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const itemById = id => ITEMS.find(i => i.id === id);
  const iname = it => ja() ? it.nj : it.name;
  const isub = it => ja() ? it.sj : it.sub;
  const sname = k => ja() ? SHOPS[k].nj : SHOPS[k].n;
  const sarea = k => ja() ? SHOPS[k].aj : SHOPS[k].area;
  const dname = c => (ja() ? DEST_NAME_JA : DEST_NAME)[c];

  function fmt(yen) {
    const v = yen * RATE[st.cur];
    const digits = st.cur === "JPY" || st.cur === "KRW" ? 0 : (v < 100 ? 2 : 0);
    return SYM[st.cur] + v.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });
  }
  const toYen = v => v === "" || isNaN(+v) ? null : +v / RATE[st.cur];

  // What the buyer pays for one offer under the current buying mode. Null = not possible.
  function costOf(o) {
    const net = Math.round(o.p / 1.1);
    if (st.mode === "resident") return { eff: o.p, parts: [[t("youPay"), o.p]] };
    if (st.mode === "visitor") {
      if (!o.pickup) return null;
      if (net < REFUND_MIN) return { eff: o.p, parts: [[t("atCounter"), o.p]] };
      return { eff: net, parts: [[t("atCounter"), o.p], [t("refund"), -(o.p - net)]] };
    }
    if (!o.ship) return null;
    const fee = Math.round(o.fee * ZONE_X[DEST[st.dest]] / 100) * 100;
    return { eff: net + fee, parts: [[t("item"), net], [t("shipping"), fee]] };
  }

  function offersOf(it, applyFilters) {
    let os = it.offers.map(o => { const c = costOf(o); return c ? { ...o, ...c } : null; }).filter(Boolean);
    if (applyFilters) {
      if (st.grade) os = os.filter(o => GR[o.g] <= GR[st.grade]);
      if (st.shops.size) os = os.filter(o => st.shops.has(o.s));
      if (st.withBox) os = os.filter(o => /[bc]/.test(o.acc));
    }
    return os.sort((a, b) => a.eff - b.eff);
  }

  function matchesText(it, q) {
    if (!q) return true;
    const hay = [it.brand, it.name, it.sub, it.nj, it.sj, it.kw, it.spec.ref, it.cat].join(" ").toLowerCase();
    return q.split(/\s+/).every(w => hay.includes(w));
  }

  // Seeded weekly history of the lowest listed price (incl. tax), ending at today's lowest.
  function history(it) {
    let s = it.id * 2654435761 >>> 0;
    const rnd = () => { s = (s + 0x6D2B79F5) >>> 0; let x = Math.imul(s ^ s >>> 15, 1 | s); x ^= x + Math.imul(x ^ x >>> 7, 61 | x); return ((x ^ x >>> 14) >>> 0) / 4294967296; };
    const pts = [it.minIncl];
    for (let i = 1; i < 26; i++) pts.unshift(Math.round(pts[0] * (1 + (rnd() - 0.42) * 0.035) / 100) * 100);
    return pts;
  }

  // ---------- routing (#search, #item-3, #shops, #watchlist, #guide) ----------
  function route() {
    const h = (location.hash || "").replace(/^#/, "");
    const m = /^item-(\d+)$/.exec(h);
    if (m && itemById(+m[1])) return { view: "item", id: +m[1] };
    if (["shops", "watchlist", "guide", "check"].includes(h)) return { view: h };
    return { view: "search" };
  }
  function go(hash) { if (location.hash === "#" + hash) render(); else location.hash = hash; }

  // ---------- shared fragments ----------
  const heart = on => `<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M12 20.5s-7.5-4.6-7.5-10.1A4.4 4.4 0 0 1 12 7.6a4.4 4.4 0 0 1 7.5 2.8c0 5.5-7.5 10.1-7.5 10.1z" fill="${on ? "currentColor" : "none"}" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>`;
  const watchBtn = (id, small) => {
    const on = !!st.watch[id];
    return `<button class="watch${small ? " sm" : ""}" data-watch="${id}" aria-pressed="${on}" aria-label="${on ? t("watching") : t("watch")}">${heart(on)}${small ? "" : `<span>${on ? t("watching") : t("watch")}</span>`}</button>`;
  };
  const gradeTag = g => `<span class="grade g-${g}" title="${esc(t("gradeDesc")[g][0])}">${g}</span>`;

  function strip(os, lo, hi) {
    // Dot strip: each shop's price on one scale from lowest to highest
    if (os.length < 2) return "";
    const span = hi - lo || 1;
    return `<div class="strip" aria-hidden="true"><span class="strip-line"></span>${os.map((o, i) =>
      `<span class="dot${i === 0 ? " lo" : ""}" style="left:${((o.eff - lo) / span * 100).toFixed(1)}%"></span>`).join("")}</div>`;
  }

  // ---------- search view ----------
  function filteredRows() {
    const q = st.q.trim().toLowerCase();
    const lo = toYen(st.pmin), hi = toYen(st.pmax);
    let rows = ITEMS.filter(it => (!st.cat || it.cat === st.cat) && (!st.brands.size || st.brands.has(it.brand)) && matchesText(it, q))
      .map(it => ({ it, os: offersOf(it, true) })).filter(r => r.os.length)
      .filter(r => (lo == null || r.os[0].eff >= lo) && (hi == null || r.os[0].eff <= hi));
    const gap = r => r.os.at(-1).eff - r.os[0].eff;
    const newest = r => Math.min(...r.os.map(o => o.days ?? 9999));
    rows.sort((a, b) => st.sort === "low" ? a.os[0].eff - b.os[0].eff : st.sort === "offers" ? b.os.length - a.os.length || a.os[0].eff - b.os[0].eff :
      st.sort === "new" ? newest(a) - newest(b) : gap(b) - gap(a));
    return rows;
  }

  function activeFilterCount() {
    return st.brands.size + st.shops.size + (st.grade ? 1 : 0) + (st.pmin !== "" ? 1 : 0) + (st.pmax !== "" ? 1 : 0) + (st.withBox ? 1 : 0);
  }

  function viewSearch() {
    const rows = filteredRows();
    const shops = new Set(rows.flatMap(r => r.os.map(o => o.s)));
    const q = st.q.trim().toLowerCase();
    // facet counts ignore their own facet
    const base = ITEMS.filter(it => matchesText(it, q));
    const catCount = c => base.filter(it => !c || it.cat === c).length;
    const brands = [...new Set(ITEMS.map(i => i.brand))].sort((a, b) => a.localeCompare(b));
    const brandCount = b => base.filter(it => it.brand === b && (!st.cat || it.cat === st.cat)).length;
    const nAct = activeFilterCount();

    const cards = rows.map(({ it, os }) => {
      const lo = os[0].eff, hi = os.at(-1).eff;
      const gs = [...new Set(os.map(o => o.g))].sort((a, b) => GR[a] - GR[b]);
      return `<article class="card">
        <a class="card-link" href="#item-${it.id}" aria-label="${esc(it.brand + " " + iname(it))}"></a>
        <div class="thumb m-${esc(it.cat)}" aria-hidden="true">${esc(it.mono)}</div>
        <div class="info">
          <div class="brand">${esc(it.brand)}</div>
          <h3 class="name">${esc(iname(it))}</h3>
          <div class="sub">${esc(isub(it))}</div>
          <div class="grades">${gs.map(gradeTag).join("")}</div>
        </div>
        <div class="price">
          <div class="from">${t("from")} · ${t("effLabel")[st.mode]}</div>
          <div class="big">${fmt(lo)}</div>
          <div class="spread">${t("shopsN")(os.length)} · ${os.length > 1 ? t("gap")(fmt(hi - lo)) : t("only")}</div>
          ${strip(os, lo, hi)}
        </div>
        <div class="card-watch">${watchBtn(it.id, true)}</div>
      </article>`;
    }).join("");

    const recent = st.recent.map(itemById).filter(Boolean).slice(0, 6);

    return `
    <section class="hero">
      <h1>${t("h1")}</h1>
      <p class="lede">${t("lede")}</p>
      <div class="searchbox">
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><circle cx="11" cy="11" r="6.5" fill="none" stroke="currentColor" stroke-width="2"/><path d="M16 16l4.5 4.5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
        <input type="search" id="q" value="${esc(st.q)}" placeholder="${esc(t("ph"))}" aria-label="${esc(t("ph"))}" autocomplete="off">
      </div>
      <div class="cats" role="group" aria-label="Category">
        ${Object.entries(t("cats")).map(([v, l]) => `<button class="chip" data-cat="${v}" aria-pressed="${st.cat === v}">${l} <span class="n">${catCount(v)}</span></button>`).join("")}
      </div>
    </section>
    <div class="results">
      <aside class="filters${st.showFilters ? " open" : ""}" id="filters" aria-label="${t("filters")}">
        <div class="f-head"><h2>${t("filters")}</h2>${nAct ? `<button class="linkbtn" data-clear>${t("clear")}</button>` : ""}</div>
        <div class="f-group">
          <label class="f-label" for="grade">${t("grade")}</label>
          <select id="grade"><option value="">${t("anyGrade")}</option>${GRADES.slice(0, 4).map(g => `<option value="${g}"${st.grade === g ? " selected" : ""}>${t("gradeOpt")(g)}</option>`).join("")}</select>
        </div>
        <div class="f-group">
          <span class="f-label">${t("priceRange")} (${SYM[st.cur]})</span>
          <div class="range"><input id="pmin" inputmode="numeric" placeholder="${t("min")}" value="${esc(st.pmin)}" aria-label="${t("min")}"><span>–</span><input id="pmax" inputmode="numeric" placeholder="${t("max")}" value="${esc(st.pmax)}" aria-label="${t("max")}"></div>
        </div>
        <label class="check"><input type="checkbox" id="withBox"${st.withBox ? " checked" : ""}> ${t("withBox")}</label>
        <fieldset class="f-group"><legend class="f-label">${t("brand")}</legend>
          <div class="checks">${brands.map(b => { const n = brandCount(b); return `<label class="check${n ? "" : " dim"}"><input type="checkbox" data-brand="${esc(b)}"${st.brands.has(b) ? " checked" : ""}> ${esc(b)} <span class="n">${n}</span></label>`; }).join("")}</div>
        </fieldset>
        <fieldset class="f-group"><legend class="f-label">${t("shopsF")}</legend>
          <div class="checks">${Object.keys(SHOPS).map(k => `<label class="check"><input type="checkbox" data-shop="${k}"${st.shops.has(k) ? " checked" : ""}> ${esc(sname(k))}</label>`).join("")}</div>
        </fieldset>
      </aside>
      <div class="main">
        <div class="meta">
          <button class="fbtn" id="fbtn" aria-expanded="${st.showFilters}" aria-controls="filters">${t("filters")}${nAct ? ` · ${nAct}` : ""}</button>
          <span class="count" id="count" aria-live="polite">${t("count")(rows.length, shops.size)}</span>
          <label class="sortlbl"><span>${t("sort")}</span> <select id="sort">${Object.entries(t("sorts")).map(([v, l]) => `<option value="${v}"${st.sort === v ? " selected" : ""}>${l}</option>`).join("")}</select></label>
        </div>
        <div class="list">${cards || `<div class="empty"><strong>${t("noMatch")}</strong><p>${t("resetHint")}</p>${nAct || st.cat || st.q ? `<button class="btn ghost" data-clear-all>${t("clear")}</button>` : ""}</div>`}</div>
        ${recent.length ? `<section class="recent"><h2 class="h2s">${t("recent")}</h2><div class="minis">${recent.map(mini).join("")}</div></section>` : ""}
      </div>
    </div>`;
  }

  function mini(it) {
    const os = offersOf(it, false);
    return `<a class="mini" href="#item-${it.id}"><span class="thumb s m-${esc(it.cat)}" aria-hidden="true">${esc(it.mono)}</span>
      <span class="mini-txt"><span class="brand">${esc(it.brand)}</span><span class="mini-name">${esc(iname(it))}</span>
      <span class="mini-price">${os.length ? fmt(os[0].eff) : "—"}</span></span></a>`;
  }

  // ---------- item view ----------
  function chart(it) {
    const pts = history(it).map(v => v * RATE[st.cur]);
    const W = 640, H = 200, L = 64, R = 16, Tp = 14, B = 28;
    let lo = Math.min(...pts), hi = Math.max(...pts);
    const pad = (hi - lo) * 0.15 || hi * 0.05; lo -= pad; hi += pad;
    const x = i => L + i * (W - L - R) / (pts.length - 1);
    const y = v => Tp + (hi - v) / (hi - lo) * (H - Tp - B);
    const line = pts.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join("");
    const area = `${line}L${x(pts.length - 1).toFixed(1)},${H - B}L${L},${H - B}Z`;
    const ticks = [0, 1, 2, 3].map(k => lo + (hi - lo) * k / 3);
    const f = v => { const d = v * 1 / RATE[st.cur]; return fmt(d); };
    const weeks = [0, 8, 17, 25];
    const wl = i => ja() ? (i === 25 ? "今週" : `${25 - i}週前`) : (i === 25 ? "now" : `${25 - i}w ago`);
    return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(t("history"))}">
      ${ticks.map(v => `<line x1="${L}" x2="${W - R}" y1="${y(v).toFixed(1)}" y2="${y(v).toFixed(1)}" class="grid"/><text x="${L - 8}" y="${(y(v) + 4).toFixed(1)}" class="ax" text-anchor="end">${f(v)}</text>`).join("")}
      ${weeks.map(i => `<text x="${x(i).toFixed(1)}" y="${H - 8}" class="ax" text-anchor="${i === 0 ? "start" : i === 25 ? "end" : "middle"}">${wl(i)}</text>`).join("")}
      <path d="${area}" class="area"/><path d="${line}" class="ln"/>
      <circle cx="${x(pts.length - 1).toFixed(1)}" cy="${y(pts.at(-1)).toFixed(1)}" r="4.5" class="end"/>
    </svg>`;
  }

  function viewItem(id) {
    const it = itemById(id);
    st.recent = [id, ...st.recent.filter(x => x !== id)].slice(0, 8); store.set();
    const os = offersOf(it, false);
    const hiddenN = it.offers.length - os.length;
    const best = os[0];
    const lo = best ? best.eff : 0, hi = os.length ? os.at(-1).eff : 0;
    const h = history(it), h4 = h[h.length - 5], chg = (h.at(-1) - h4) / h4 * 100;
    const w = st.watch[id];
    const sim = ITEMS.filter(x => x.id !== id && (x.cat === it.cat || x.brand === it.brand))
      .sort((a, b) => (b.brand === it.brand) - (a.brand === it.brand)).slice(0, 4);
    const accTxt = a => a ? a.split("").map(c => t("acc")[c]).join(" · ") : t("accNone");
    const spec = [[t("specRef"), it.spec.ref], [t("specYear"), it.spec.year], [t("specSize"), it.spec.size], [t("specMat"), ja() ? it.spec.matj : it.spec.mat]];

    return `
    <a class="back" href="#search">← ${t("back")}</a>
    <section class="item-head">
      <div class="thumb xl m-${esc(it.cat)}" aria-hidden="true">${esc(it.mono)}</div>
      <div class="item-info">
        <div class="brand">${esc(it.brand)} · ${t("cats")[it.cat]}</div>
        <h1 class="item-name">${esc(iname(it))}</h1>
        <p class="sub">${esc(isub(it))}</p>
        <dl class="spec">${spec.map(([k, v]) => `<div><dt>${k}</dt><dd>${esc(v)}</dd></div>`).join("")}</dl>
        <div class="item-actions">${watchBtn(id, false)}${w && w.target ? `<span class="pill">${t("alertOn")(fmt(w.target))}</span>` : ""}</div>
      </div>
      <div class="paybox">
        ${best ? `<div class="from">${t("from")} · ${esc(sname(best.s))}</div>
        <div class="paybig">${fmt(best.eff)}</div>
        <div class="paylbl">${t("effLabel")[st.mode]}</div>
        <dl class="parts">${best.parts.map(([k, v]) => `<div><dt>${k}</dt><dd>${v < 0 ? "−" : ""}${fmt(Math.abs(v))}</dd></div>`).join("")}</dl>` :
        `<div class="paylbl">${t("noMatch")}</div>`}
        <p class="hint">${t("modeHint")[st.mode]}</p>
      </div>
    </section>

    <section class="panel">
      <div class="panel-head"><h2>${t("shopsN")(os.length)}</h2>${os.length > 1 ? `<span class="muted">${t("gap")(fmt(hi - lo))}</span>` : ""}</div>
      ${os.length > 1 ? `<div class="range-wrap"><span class="muted sm">${t("marketRange")}</span>${strip(os, lo, hi)}<div class="range-ends"><span>${fmt(lo)}</span><span>${fmt(hi)}</span></div></div>` : ""}
      <div class="table-wrap"><table>
        <thead><tr><th>${t("thShop")}</th><th>${t("thGrade")}</th><th>${t("thIncl")}</th><th>${t("thAvail")}</th><th>${t("thListed")}</th><th class="num">${t("thPrice")}</th><th><span class="sr">${t("view")}</span></th></tr></thead>
        <tbody>${os.map((o, i) => `<tr${i === 0 && os.length > 1 ? ' class="best"' : ""}>
          <td class="store">${esc(sname(o.s))}${i === 0 && os.length > 1 ? `<span class="hanko">${t("lowest")}</span>` : ""}<small>${esc(sarea(o.s))} · ★ ${SHOPS[o.s].rating.toFixed(1)}</small></td>
          <td>${gradeTag(o.g)}</td>
          <td class="sm">${accTxt(o.acc)}</td>
          <td><div class="tags">${o.pickup ? `<span class="tag">${t("pickup")}</span>` : ""}${o.ship ? `<span class="tag ok">${t("overseas")}</span>` : `<span class="tag">${t("jponly")}</span>`}</div></td>
          <td class="sm muted">${o.days == null ? "—" : t("daysAgo")(o.days)}</td>
          <td class="num"><strong>${fmt(o.eff)}</strong>${o.parts.length > 1 ? `<small>${o.parts.map(([k, v]) => `${v < 0 ? "−" : "+"}${fmt(Math.abs(v))}`).slice(1).join(" ")}</small>` : ""}</td>
          <td><button class="go" data-go="${esc(SHOPS[o.s].n)}">${t("view")}</button></td>
        </tr>`).join("")}</tbody>
      </table></div>
      ${hiddenN ? `<p class="muted sm pad">${t("hidden")(hiddenN)}</p>` : ""}
    </section>

    <div class="two">
      <section class="panel">
        <div class="panel-head"><h2>${t("history")}</h2><span class="muted sm">${t("histNote")}</span></div>
        <div class="stats">
          <div><span>${t("h26low")}</span><strong>${fmt(Math.min(...h))}</strong></div>
          <div><span>${t("h26high")}</span><strong>${fmt(Math.max(...h))}</strong></div>
          <div><span>${t("vs4w")}</span><strong class="${chg <= 0 ? "down" : "up"}">${chg <= 0 ? "▼" : "▲"} ${Math.abs(chg).toFixed(1)}%</strong></div>
        </div>
        <div class="chart-wrap">${chart(it)}</div>
      </section>
      <section class="panel">
        <div class="panel-head"><h2>${t("alert")}</h2></div>
        <p class="muted sm">${t("alertHint")}</p>
        <form class="alert-form" id="alertForm" data-id="${id}">
          <label class="money"><span>${SYM[st.cur]}</span><input id="alertVal" inputmode="numeric" value="${w && w.target ? Math.round(w.target * RATE[st.cur]) : best ? Math.round(best.eff * 0.95 * RATE[st.cur]) : ""}" aria-label="${t("alert")}"></label>
          <button class="btn" type="submit">${t("alertSet")}</button>
          ${w && w.target ? `<button class="btn ghost" type="button" data-alert-clear="${id}">${t("alertClear")}</button>` : ""}
        </form>
      </section>
    </div>

    ${sim.length ? `<section class="recent"><h2 class="h2s">${t("similar")}</h2><div class="minis">${sim.map(mini).join("")}</div></section>` : ""}`;
  }

  // ---------- shops view ----------
  function viewShops() {
    const counts = {};
    ITEMS.forEach(it => it.offers.forEach(o => { counts[o.s] = (counts[o.s] || 0) + 1; }));
    return `<section class="page-head"><h1>${t("shopsH")}</h1><p class="lede">${t("shopsLede")}</p></section>
    <div class="shops">${Object.entries(SHOPS).map(([k, s]) => `<article class="shop">
      <div class="shop-top"><span class="type">${t("types")[s.type]}</span><span class="rating">★ ${s.rating.toFixed(1)}</span></div>
      <h3>${esc(ja() ? s.nj : s.n)}</h3><div class="sub">${esc(ja() ? s.n : s.nj)}</div>
      <dl class="spec">
        <div><dt>${ja() ? "エリア" : "Area"}</dt><dd>${esc(sarea(k))}</dd></div>
        <div><dt>${t("hours")}</dt><dd>${s.hours}</dd></div>
        <div><dt>${t("langs")}</dt><dd>${["JA", ...s.langs].join(" · ")}</dd></div>
      </dl>
      <div class="tags">${s.refund ? `<span class="tag">${t("refundOk")}</span>` : ""}${s.ship ? `<span class="tag ok">${t("shipOk")}</span>` : `<span class="tag">${t("noShip")}</span>`}<span class="tag">${t("since")(s.since)}</span></div>
      <div class="shop-foot"><span class="muted sm">${t("listed")(counts[k] || 0)}</span><button class="btn ghost" data-shop-go="${k}">${t("seeItems")} →</button></div>
    </article>`).join("")}</div>`;
  }

  // ---------- watchlist view ----------
  function viewWatch() {
    const ids = Object.keys(st.watch).map(Number).filter(itemById);
    const head = `<section class="page-head"><h1>${t("watchH")}</h1><p class="lede">${t("watchLede")}</p></section>`;
    if (!ids.length) return head + `<div class="empty"><p>${t("watchEmpty")}</p><a class="btn" href="#search">${t("nav").search}</a></div>`;
    return head + `<div class="list">${ids.map(id => {
      const it = itemById(id), w = st.watch[id], os = offersOf(it, false), now = os.length ? os[0].eff : null;
      const hit = w.target && now != null && now <= w.target;
      const h = history(it), chg = (h.at(-1) - h[h.length - 5]) / h[h.length - 5] * 100;
      return `<article class="card wcard${hit ? " hit" : ""}">
        <a class="card-link" href="#item-${id}" aria-label="${esc(it.brand + " " + iname(it))}"></a>
        <div class="thumb m-${esc(it.cat)}" aria-hidden="true">${esc(it.mono)}</div>
        <div class="info"><div class="brand">${esc(it.brand)}</div><h3 class="name">${esc(iname(it))}</h3><div class="sub">${esc(isub(it))}</div>
          ${hit ? `<span class="hanko">${t("hit")}</span>` : ""}</div>
        <dl class="wnums">
          <div><dt>${t("now")} · ${t("effLabel")[st.mode]}</dt><dd>${now != null ? fmt(now) : "—"}</dd></div>
          <div><dt>${t("vs4w")}</dt><dd class="${chg <= 0 ? "down" : "up"}">${chg <= 0 ? "▼" : "▲"} ${Math.abs(chg).toFixed(1)}%</dd></div>
          <div><dt>${t("target")}</dt><dd>${w.target ? fmt(w.target) : t("noTarget")}</dd></div>
        </dl>
        <div class="card-watch"><button class="linkbtn" data-watch="${id}">${t("removeW")}</button></div>
      </article>`;
    }).join("")}</div>`;
  }

  // ---------- guide view ----------
  function viewGuide() {
    const gd = t("gradeDesc");
    return `<section class="page-head"><h1>${t("guideH")}</h1><p class="lede">${t("guideLede")}</p></section>
    <div class="guide">
      <section class="panel"><h2>${t("gGrades")}</h2><p>${t("gGradesP")}</p>
        <div class="grade-scale">${GRADES.map(g => `<div class="gs">${gradeTag(g)}<div><strong>${gd[g][0]}</strong><p>${gd[g][1]}</p></div></div>`).join("")}</div>
      </section>
      <section class="panel"><h2>${t("gTax")}</h2><ol class="steps">${t("gTaxList").map(x => `<li>${x}</li>`).join("")}</ol></section>
      <section class="panel"><h2>${t("gShip")}</h2><ul>${t("gShipList").map(x => `<li>${x}</li>`).join("")}</ul>
        <p class="muted sm">${Object.entries(ZONE_X).map(([z, x]) => `${t("zones")[z]} ×${x}`).join(" · ")}</p></section>
      <section class="panel"><h2>${t("gAuth")}</h2><p>${t("gAuthP")}</p></section>
    </div>`;
  }

  // ---------- CSV check view (for shops; logic lives in assets/checker.js) ----------
  const CSV_HEADER = "sku,brand,name,ref,grade,price,store_pickup,ships_overseas,shipping_fee,accessories,listed_on,status";
  function viewCheck() {
    const shops = Object.entries(SHOPS).sort((a, b) => sname(a[0]).localeCompare(sname(b[0]), st.lang));
    return `<section class="page-head"><h1>${t("checkH")}</h1><p class="lede">${t("checkLede")}</p></section>
    <div class="check-grid">
      <section class="panel ck-panel">
        <div class="ck-form">
          <label class="f-group"><span class="f-label">${t("checkShop")}</span>
            <select id="checkShop"><option value="">—</option>${shops.map(([k]) => `<option value="${k}">${esc(sname(k))} (${k}.csv)</option>`).join("")}</select></label>
          <label class="drop" id="dropZone">
            <input type="file" id="csvFile" accept=".csv,text/csv">
            <strong>${t("checkDrop")}</strong><span class="muted sm">${t("checkDropSub")}</span>
          </label>
        </div>
        <div id="checkOut" class="ck-out" aria-live="polite"></div>
      </section>
      <aside class="ck-side">
        <section class="panel"><div class="panel-head"><h2>${t("checkColsH")}</h2></div>
          <p class="muted sm pad">${t("checkColsP")}</p>
          <div class="codebox"><code id="csvHeader">${CSV_HEADER}</code><button class="btn ghost" data-copy="csvHeader">${t("copy")}</button></div>
          <ul class="ck-cols">${t("checkCols").map(([c, d]) => `<li><code>${c}</code> ${d}</li>`).join("")}</ul>
          <p class="pad sm"><a href="data/templates/listings-template.csv">${t("checkTemplate")}</a></p>
        </section>
        <section class="panel"><div class="panel-head"><h2>${t("sendH")}</h2></div>
          <ol class="steps sm">${t("sendSteps").map(x => `<li>${x}</li>`).join("")}</ol>
        </section>
      </aside>
    </div>`;
  }

  // ---------- chrome ----------
  function renderChrome(r) {
    document.documentElement.lang = st.lang;
    const wn = Object.keys(st.watch).length;
    $("tagline").textContent = t("tagline");
    $("demo").textContent = t("demo");
    $("nav").innerHTML = ["search", "shops", "watchlist", "guide"].map(v =>
      `<a href="#${v}"${(r.view === v || (v === "search" && r.view === "item")) ? ' aria-current="page"' : ""}>${t("nav")[v]}${v === "watchlist" && wn ? ` <span class="badge">${wn}</span>` : ""}</a>`).join("");
    $("l-en").setAttribute("aria-pressed", st.lang === "en");
    $("l-ja").setAttribute("aria-pressed", st.lang === "ja");
    $("curLbl").textContent = t("currency");
    $("cur").value = st.cur;
    const showBuy = r.view === "search" || r.view === "item";
    $("buybar").hidden = !showBuy;
    if (showBuy) {
      $("buyLbl").textContent = t("buyAs");
      $("modes").innerHTML = ["visitor", "resident", "ship"].map(m => `<button class="seg" data-mode="${m}" aria-pressed="${st.mode === m}">${t("modes")[m]}</button>`).join("");
      $("destWrap").hidden = st.mode !== "ship";
      $("destLbl").textContent = t("shipTo");
      $("dest").innerHTML = Object.keys(DEST).map(c => `<option value="${c}"${c === st.dest ? " selected" : ""}>${esc(dname(c))}</option>`).join("");
      $("modeHint").textContent = t("modeHint")[st.mode];
    }
    $("note").textContent = t("note");
    $("forShops").textContent = t("forShops");
  }

  let lastView = "";
  function render(keepFocus) {
    const r = route();
    renderChrome(r);
    const v = $("view");
    const active = keepFocus && document.activeElement && document.activeElement.id;
    const caret = active === "q" ? $("q").selectionStart : null;
    v.innerHTML = r.view === "item" ? viewItem(r.id) : r.view === "shops" ? viewShops() : r.view === "watchlist" ? viewWatch() : r.view === "guide" ? viewGuide() : r.view === "check" ? viewCheck() : viewSearch();
    const key = r.view + (r.id || "");
    if (key !== lastView) { window.scrollTo(0, 0); lastView = key; }
    if (active && $(active)) { $(active).focus(); if (caret != null) $(active).setSelectionRange(caret, caret); }
    document.dispatchEvent(new CustomEvent("tsugi:render", { detail: { view: r.view, lang: st.lang } }));
    document.title = r.view === "item" ? `${itemById(r.id).brand} ${iname(itemById(r.id))} · Tsugi` : "Tsugi Resale Compare";
  }

  // ---------- toast ----------
  let tt;
  function toast(m) { const el = $("toast"); el.textContent = m; el.hidden = false; clearTimeout(tt); tt = setTimeout(() => { el.hidden = true; }, 2600); }

  function toggleWatch(id) {
    if (st.watch[id]) { delete st.watch[id]; toast(t("watchRemoved")); }
    else { const os = offersOf(itemById(id), false); st.watch[id] = { at: Date.now(), saved: os.length ? os[0].eff : null, target: null }; toast(t("watchAdded")); }
    store.set(); render();
  }

  function clearFilters(all) {
    st.brands.clear(); st.shops.clear(); st.grade = ""; st.pmin = ""; st.pmax = ""; st.withBox = false;
    if (all) { st.cat = ""; st.q = ""; }
    render();
  }

  // ---------- events (delegated) ----------
  document.addEventListener("click", e => {
    const el = e.target.closest("button, a");
    if (!el) return;
    const d = el.dataset;
    if (d.lang) { st.lang = d.lang; store.set(); render(); }
    else if (d.mode) { st.mode = d.mode; store.set(); render(); }
    else if (d.cat !== undefined) { st.cat = d.cat; render(); }
    else if (d.watch) { e.preventDefault(); toggleWatch(+d.watch); }
    else if (d.go) toast(t("toast")(d.go));
    else if ("clear" in d) clearFilters(false);
    else if ("clearAll" in d) clearFilters(true);
    else if (d.shopGo) { clearFilters(true); st.shops.add(d.shopGo); go("search"); }
    else if (d.alertClear) { const w = st.watch[+d.alertClear]; if (w) { w.target = null; store.set(); render(); } }
    else if (el.id === "fbtn") { st.showFilters = !st.showFilters; render(); }
    else if (d.copy) {
      const src = $(d.copy), text = src.textContent;
      const done = () => toast(t("copied"));
      const fallback = () => { const r = document.createRange(); r.selectNodeContents(src); const sel = getSelection(); sel.removeAllRanges(); sel.addRange(r); };
      try { navigator.clipboard.writeText(text).then(done, fallback); } catch (_) { fallback(); }
    }
  });

  document.addEventListener("input", e => {
    const el = e.target;
    if (el.id === "q") { st.q = el.value; render(true); }
    else if (el.id === "pmin" || el.id === "pmax") { st[el.id] = el.value.replace(/[^\d.]/g, ""); render(true); }
  });

  document.addEventListener("change", e => {
    const el = e.target;
    if (el.id === "cur") { st.cur = el.value; st.pmin = st.pmax = ""; store.set(); render(); }
    else if (el.id === "dest") { st.dest = el.value; store.set(); render(); }
    else if (el.id === "sort") { st.sort = el.value; render(); }
    else if (el.id === "grade") { st.grade = el.value; render(); }
    else if (el.id === "withBox") { st.withBox = el.checked; render(); }
    else if (el.dataset.brand) { el.checked ? st.brands.add(el.dataset.brand) : st.brands.delete(el.dataset.brand); render(); }
    else if (el.dataset.shop) { el.checked ? st.shops.add(el.dataset.shop) : st.shops.delete(el.dataset.shop); render(); }
  });

  document.addEventListener("submit", e => {
    if (e.target.id !== "alertForm") return;
    e.preventDefault();
    const id = +e.target.dataset.id, v = toYen($("alertVal").value.replace(/[^\d.]/g, ""));
    if (v == null || v <= 0) return;
    if (!st.watch[id]) { const os = offersOf(itemById(id), false); st.watch[id] = { at: Date.now(), saved: os.length ? os[0].eff : null, target: null }; }
    st.watch[id].target = Math.round(v);
    store.set(); toast(t("alertSaved")); render();
  });

  window.addEventListener("hashchange", () => render());
  render();
})();
