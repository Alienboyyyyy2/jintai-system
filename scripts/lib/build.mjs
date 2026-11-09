// Turns the CSV files into the data object the site reads (window.TSUGI_DATA).
// Pure function: text in, { data, problems, stats } out. File I/O lives in scripts/build-data.mjs.
import { readRecords } from "./csv.mjs";
import { matchKey, refKey, parseGrade, parsePrice, parseFee, parseBool, parseAccessories, parseDate, isAvailable } from "./normalize.mjs";

const SHOP_TYPES = ["chain", "designer", "vintage", "luxury", "watch"];
const CATEGORIES = ["Bags", "Watches", "Accessories", "Apparel", "Shoes"];
const split = s => String(s || "").split(/[;|]/).map(x => x.trim()).filter(Boolean);

function need(rec, cols, where, problems) {
  const missing = cols.filter(c => !rec[c]);
  if (missing.length) problems.push({ level: "error", where: `${where}:${rec._line}`, msg: `missing ${missing.join(", ")}` });
  return !missing.length;
}

function requireHeaders(headers, cols, where, problems) {
  const missing = cols.filter(c => !headers.includes(c));
  if (missing.length) problems.push({ level: "error", where, msg: `missing column(s): ${missing.join(", ")}` });
  return !missing.length;
}

export function buildData({ shopsCSV, brandsCSV = "", productsCSV, listingCSVs }) {
  const problems = [];
  const stats = { listings: 0, matched: 0, sold: 0, skipped: 0, unmatched: [] };

  // ---- shops ----
  const SHOPS = {};
  const sh = readRecords(shopsCSV);
  const shopCols = ["id", "name_en", "name_ja", "type", "area_en", "area_ja", "city", "hours", "languages", "tax_refund", "ships_overseas", "since", "rating"];
  if (requireHeaders(sh.headers, shopCols, "shops.csv", problems)) {
    for (const r of sh.records) {
      if (!need(r, ["id", "name_en", "name_ja", "type"], "shops.csv", problems)) continue;
      if (!/^[a-z0-9_-]+$/.test(r.id)) { problems.push({ level: "error", where: `shops.csv:${r._line}`, msg: `shop id "${r.id}" must be lower-case letters, digits, - or _` }); continue; }
      if (SHOPS[r.id]) { problems.push({ level: "error", where: `shops.csv:${r._line}`, msg: `duplicate shop id "${r.id}"` }); continue; }
      if (!SHOP_TYPES.includes(r.type)) problems.push({ level: "warn", where: `shops.csv:${r._line}`, msg: `type "${r.type}" is not one of ${SHOP_TYPES.join(", ")}` });
      const refund = parseBool(r.tax_refund, "tax_refund"), ship = parseBool(r.ships_overseas, "ships_overseas");
      [refund, ship].forEach(x => x.error && problems.push({ level: "error", where: `shops.csv:${r._line}`, msg: x.error }));
      SHOPS[r.id] = {
        n: r.name_en, nj: r.name_ja, type: r.type, area: r.area_en, aj: r.area_ja, city: r.city, hours: r.hours,
        langs: split(r.languages), refund: !!refund.value, ship: !!ship.value,
        since: +r.since || null, rating: Math.round((+r.rating || 0) * 10) / 10
      };
    }
  }

  // ---- brand aliases (optional): "シャネル" -> Chanel ----
  const brandOf = new Map();
  for (const r of readRecords(brandsCSV).records) {
    if (!r.brand) continue;
    [r.brand, ...split(r.aliases)].forEach(a => brandOf.set(matchKey(a), r.brand));
  }
  const canonBrand = b => brandOf.get(matchKey(b)) || b;

  // ---- products (the catalogue every listing is matched against) ----
  const products = [];
  const byRef = new Map(), byName = new Map();
  const pr = readRecords(productsCSV);
  const prodCols = ["id", "brand", "category", "name_en", "name_ja"];
  if (requireHeaders(pr.headers, prodCols, "products.csv", problems)) {
    for (const r of pr.records) {
      if (!need(r, prodCols, "products.csv", problems)) continue;
      const id = +r.id;
      if (!Number.isInteger(id) || id <= 0) { problems.push({ level: "error", where: `products.csv:${r._line}`, msg: `id "${r.id}" must be a positive whole number` }); continue; }
      if (products.some(p => p.id === id)) { problems.push({ level: "error", where: `products.csv:${r._line}`, msg: `duplicate product id ${id}` }); continue; }
      if (!CATEGORIES.includes(r.category)) problems.push({ level: "warn", where: `products.csv:${r._line}`, msg: `category "${r.category}" is not one of ${CATEGORIES.join(", ")}` });
      const brand = canonBrand(r.brand);
      const p = {
        id, brand, cat: r.category, mono: r.mono || brand.slice(0, 2).toUpperCase(),
        kw: r.keywords || "", name: r.name_en, nj: r.name_ja, sub: r.sub_en || "", sj: r.sub_ja || "",
        spec: { ref: r.ref || "—", year: r.year || "—", size: r.size || "—", mat: r.material_en || "—", matj: r.material_ja || r.material_en || "—" },
        offers: []
      };
      products.push(p);
      const rk = refKey(r.ref);
      if (rk) {
        if (byRef.has(rk)) problems.push({ level: "warn", where: `products.csv:${r._line}`, msg: `reference ${r.ref} is also used by product ${byRef.get(rk).id}` });
        else byRef.set(rk, p);
      }
      const bk = matchKey(brand);
      for (const nm of [r.name_en, r.name_ja, ...split(r.aliases)]) byName.set(bk + "|" + matchKey(nm), p);
    }
  }

  // ---- listings: one CSV per shop, file name = shop id ----
  const listCols = ["brand", "name", "grade", "price"];
  for (const [shopId, text] of Object.entries(listingCSVs)) {
    const file = `listings/${shopId}.csv`;
    if (!SHOPS[shopId]) { problems.push({ level: "error", where: file, msg: `no shop "${shopId}" in shops.csv (the file name must be the shop id)` }); continue; }
    const { headers, records } = readRecords(text);
    if (!requireHeaders(headers, listCols, file, problems)) continue;
    const seenSku = new Set();
    for (const r of records) {
      stats.listings++;
      const where = `${file}:${r._line}`;
      if (r.status !== undefined && !isAvailable(r.status)) { stats.sold++; continue; }
      if (!need(r, listCols, file, problems)) { stats.skipped++; continue; }
      if (r.sku) {
        if (seenSku.has(r.sku)) problems.push({ level: "warn", where, msg: `sku ${r.sku} appears more than once` });
        seenSku.add(r.sku);
      }
      const grade = parseGrade(r.grade), price = parsePrice(r.price), fee = parseFee(r.shipping_fee);
      const pickup = r.store_pickup === undefined ? { value: true } : parseBool(r.store_pickup, "store_pickup");
      const ship = r.ships_overseas === undefined ? { value: SHOPS[shopId].ship } : parseBool(r.ships_overseas, "ships_overseas");
      const acc = parseAccessories(r.accessories);
      const listed = r.listed_on ? parseDate(r.listed_on) : { value: null };
      const errs = [grade, price, fee, pickup, ship, acc, listed].filter(x => x.error);
      if (errs.length) { errs.forEach(e => problems.push({ level: "error", where, msg: e.error })); stats.skipped++; continue; }
      if (ship.value && !fee.value) problems.push({ level: "warn", where, msg: "ships overseas but shipping_fee is empty; shown as free shipping" });
      if (ship.value && !SHOPS[shopId].ship) problems.push({ level: "warn", where, msg: "listing ships overseas but the shop is marked as not shipping overseas" });

      // Match: 1) reference number  2) brand + product name or alias
      const rk = refKey(r.ref);
      let p = rk && byRef.get(rk);
      if (!p) p = byName.get(matchKey(canonBrand(r.brand)) + "|" + matchKey(r.name));
      if (!p) { stats.unmatched.push({ shop: shopId, line: r._line, sku: r.sku || "", brand: r.brand, name: r.name, ref: r.ref || "" }); continue; }
      if (matchKey(canonBrand(r.brand)) !== matchKey(p.brand)) problems.push({ level: "warn", where, msg: `matched product ${p.id} by reference but brand "${r.brand}" differs from "${p.brand}"` });

      p.offers.push([shopId, grade.value, price.value, pickup.value ? 1 : 0, ship.value ? 1 : 0, fee.value, acc.value, listed.value]);
      stats.matched++;
    }
  }

  stats.unmatched.forEach(u => problems.push({ level: "warn", where: `listings/${u.shop}.csv:${u.line}`, msg: `no product matches "${u.brand} ${u.name}"${u.ref ? ` (ref ${u.ref})` : ""}; add it to products.csv or as an alias` }));
  const ITEMS = products.filter(p => p.offers.length);
  const empty = products.filter(p => !p.offers.length);
  stats.products = products.length;
  stats.items = ITEMS.length;
  stats.withoutListings = empty.map(p => p.id);

  // Stable order so the generated file only changes when the data does
  ITEMS.sort((a, b) => a.id - b.id);
  ITEMS.forEach(p => p.offers.sort((a, b) => a[2] - b[2] || a[0].localeCompare(b[0])));
  return { data: { SHOPS, ITEMS }, problems, stats };
}

export function renderDataJS(data) {
  // Pretty JSON, with arrays of plain values (offers, languages) kept on one line for readable diffs
  const body = JSON.stringify(data, null, 2)
    .replace(/\[\s*\n([^\[\]{}]*?)\n\s*\]/g, (_, inner) => "[" + inner.split(/,\s*\n\s*/).map(s => s.trim()).join(", ") + "]");
  return `/* GENERATED by scripts/build-data.mjs from data/*.csv — do not edit by hand.
   Run \`npm run build:data\` after changing the CSV files.
   Offer tuple: [shop, grade, price incl. tax (JPY), in-store pickup, ships overseas,
                 overseas shipping fee (JPY, Asia zone), accessories, listed on (YYYY-MM-DD)] */
window.TSUGI_DATA = ${body};
`;
}
