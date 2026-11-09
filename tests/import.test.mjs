import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { parseCSV, readRecords, toCSV } from "../scripts/lib/csv.mjs";
import { refKey, matchKey, parseGrade, parsePrice, parseBool, parseAccessories, parseDate, isAvailable } from "../scripts/lib/normalize.mjs";
import { buildData, renderDataJS } from "../scripts/lib/build.mjs";

test("CSV: quotes, escaped quotes, CRLF, BOM, blank lines", () => {
  const rows = parseCSV('﻿a,b\r\n"1,000","say ""hi"""\r\n\r\nx,\n');
  assert.deepEqual(rows, [["a", "b"], ["1,000", 'say "hi"'], ["x", ""]]);
});

test("CSV: multi-line quoted field and round trip", () => {
  const rows = [["name", "note"], ["Kelly", "line 1\nline 2"]];
  assert.deepEqual(parseCSV(toCSV(rows[0], rows.slice(1))), rows);
});

test("CSV: records keep the source line number", () => {
  const { records } = readRecords("ID,Name\n1, a \n\n2,b\n");
  assert.equal(records[0].name, "a");
  assert.equal(records[0]._line, 2);
  assert.equal(records[1].id, "2");
});

test("reference numbers ignore width, case and separators", () => {
  assert.equal(refKey("126610 ln"), "126610LN");
  assert.equal(refKey("１２６６１０ＬＮ"), "126610LN");
  assert.equal(refKey("310.30.42.50.01.001"), "31030425001001");
  assert.equal(refKey("—"), "");
  assert.equal(matchKey("マトラッセ　チェーンショルダー・ミディアム"), matchKey("マトラッセチェーンショルダーミディアム"));
});

test("grades in the forms shops use", () => {
  for (const [input, want] of [["A", "A"], ["Aランク", "A"], ["ランクAB", "AB"], ["rank b", "B"], ["ＡＢ", "AB"], ["未使用", "S"], ["美品", "A"], ["N", "S"]]) {
    assert.equal(parseGrade(input).value, want, input);
  }
  assert.ok(parseGrade("D").error);
  assert.ok(parseGrade("").error);
});

test("prices in the forms shops use", () => {
  for (const s of ["1298000", "1,298,000", "¥1,298,000", "1298000円", "１，２９８，０００", "1,298,000円(税込)"]) {
    assert.equal(parsePrice(s).value, 1298000, s);
  }
  assert.ok(parsePrice("ask").error);
  assert.ok(parsePrice("12.5").error);
  assert.ok(parsePrice("50").error);
});

test("yes/no, accessories, dates, status", () => {
  assert.equal(parseBool("○").value, true);
  assert.equal(parseBool("不可").value, false);
  assert.ok(parseBool("maybe", "x").error);
  assert.equal(parseAccessories("保存袋;ギャランティ;箱").value, "bdc");
  assert.equal(parseAccessories("Box, dust bag").value, "bd");
  assert.equal(parseAccessories("本体のみ").value, "");
  assert.ok(parseAccessories("strap").error);
  assert.equal(parseDate("2026/11/2").value, "2026-11-02");
  assert.equal(parseDate("2026年11月2日").value, "2026-11-02");
  assert.ok(parseDate("2026-02-30").error);
  assert.equal(isAvailable("available"), true);
  assert.equal(isAvailable(""), true);
  assert.equal(isAvailable("売約済"), false);
  assert.equal(isAvailable("SOLD OUT"), false);
});

const SHOPS = "id,name_en,name_ja,type,area_en,area_ja,city,hours,languages,tax_refund,ships_overseas,since,rating\n" +
  "alpha,Alpha,アルファ,chain,Tokyo,東京,Tokyo,10-20,EN;ZH,yes,yes,2000,4.5\n" +
  "beta,Beta,ベータ,vintage,Osaka,大阪,Osaka,10-20,EN,yes,no,2010,4.0\n";
const BRANDS = "brand,aliases\nRolex,ロレックス;ROLEX\nChanel,シャネル\n";
const PRODUCTS = "id,brand,category,name_en,name_ja,ref,aliases\n" +
  "1,Rolex,Watches,Submariner Date,サブマリーナ デイト,126610LN,\n" +
  "2,Chanel,Bags,Classic Flap Medium,マトラッセ ミディアム,,マトラッセ25;Matelasse 25\n" +
  "3,Chanel,Bags,Boy Bag,ボーイシャネル,,\n";
const HEAD = "sku,brand,name,ref,grade,price,store_pickup,ships_overseas,shipping_fee,accessories,listed_on,status\n";

test("build: matches by reference, by name, by alias and by Japanese brand", () => {
  const { data, problems, stats } = buildData({
    shopsCSV: SHOPS, brandsCSV: BRANDS, productsCSV: PRODUCTS,
    listingCSVs: {
      alpha: HEAD +
        "A1,ROLEX,サブマリーナ,１２６６１０ ＬＮ,Aランク,\"1,958,000\",yes,yes,9800,箱;保証書,2026/11/01,\n" +
        "A2,シャネル,マトラッセ25,,AB,1240000,yes,yes,6800,保存袋,2026-10-10,available\n" +
        "A3,Chanel,Classic Flap Medium,,S,1500000,yes,yes,6800,,2026-10-12,売約済\n",
      beta: HEAD + "B1,Chanel,Classic  Flap  Medium,,B,1180000,yes,no,,,2026-09-19,\n"
    }
  });
  assert.equal(problems.filter(p => p.level === "error").length, 0, JSON.stringify(problems));
  assert.equal(stats.matched, 3);
  assert.equal(stats.sold, 1);
  const rolex = data.ITEMS.find(i => i.id === 1);
  assert.deepEqual(rolex.offers, [["alpha", "A", 1958000, 1, 1, 9800, "bc", "2026-11-01"]]);
  const flap = data.ITEMS.find(i => i.id === 2);
  assert.deepEqual(flap.offers.map(o => o[0]), ["beta", "alpha"], "cheapest first");
  assert.ok(!data.ITEMS.some(i => i.id === 3), "products without listings are left out");
  assert.deepEqual(stats.withoutListings, [3]);
  assert.deepEqual(data.SHOPS.alpha.langs, ["EN", "ZH"]);
});

test("build: bad rows are reported with file and line, others still load", () => {
  const { data, problems, stats } = buildData({
    shopsCSV: SHOPS, brandsCSV: BRANDS, productsCSV: PRODUCTS,
    listingCSVs: {
      alpha: HEAD +
        "A1,Rolex,Submariner Date,126610LN,Z,1958000,yes,yes,9800,,2026-11-01,\n" +
        "A2,Rolex,Submariner Date,126610LN,A,price on request,yes,yes,9800,,2026-11-01,\n" +
        "A3,Rolex,Submariner Date,126610LN,A,1990000,yes,yes,9800,,2026-11-01,\n" +
        "A4,Hermès,Kelly 28,,A,2380000,yes,yes,7800,,2026-11-01,\n",
      gamma: HEAD + "G1,Rolex,Submariner Date,126610LN,A,1990000,yes,yes,9800,,2026-11-01,\n"
    }
  });
  const errs = problems.filter(p => p.level === "error");
  assert.ok(errs.some(e => e.where === "listings/alpha.csv:2" && /grade/.test(e.msg)));
  assert.ok(errs.some(e => e.where === "listings/alpha.csv:3" && /price/.test(e.msg)));
  assert.ok(errs.some(e => e.where === "listings/gamma.csv" && /no shop "gamma"/.test(e.msg)));
  assert.equal(stats.skipped, 2);
  assert.equal(stats.unmatched.length, 1);
  assert.equal(stats.unmatched[0].name, "Kelly 28");
  assert.equal(data.ITEMS.find(i => i.id === 1).offers.length, 1);
});

test("build: missing columns are reported", () => {
  const { problems } = buildData({ shopsCSV: SHOPS, productsCSV: PRODUCTS, listingCSVs: { alpha: "sku,brand,name\nA1,Rolex,Sub\n" } });
  assert.ok(problems.some(p => p.level === "error" && /missing column\(s\): grade, price/.test(p.msg)));
});

test("the repository's own CSV files build cleanly and match assets/data.js", () => {
  const read = f => readFileSync(new URL(`../${f}`, import.meta.url), "utf8");
  const listingCSVs = {};
  for (const f of readdirSync(new URL("../data/listings/", import.meta.url))) listingCSVs[f.replace(/\.csv$/, "")] = read(`data/listings/${f}`);
  const { data, problems } = buildData({ shopsCSV: read("data/shops.csv"), brandsCSV: read("data/brands.csv"), productsCSV: read("data/products.csv"), listingCSVs });
  assert.deepEqual(problems, []);
  assert.equal(renderDataJS(data), read("assets/data.js"), "run `npm run build:data` and commit assets/data.js");
});
