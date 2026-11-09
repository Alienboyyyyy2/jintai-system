#!/usr/bin/env node
// Builds assets/data.js from the CSV files in data/.
//
//   npm run build:data            write assets/data.js and print a report
//   npm run build:data -- --check fail if assets/data.js is out of date (for CI)
//   npm run build:data -- --strict treat warnings (e.g. unmatched listings) as failures
import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync } from "node:fs";
import { join, dirname, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { buildData, renderDataJS } from "./lib/build.mjs";
import { toCSV } from "./lib/csv.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dataDir = join(root, "data");
const out = join(root, "assets", "data.js");
const args = new Set(process.argv.slice(2));
const read = f => readFileSync(f, "utf8");

const listingDir = join(dataDir, "listings");
const listingCSVs = {};
for (const f of readdirSync(listingDir).filter(f => f.toLowerCase().endsWith(".csv")).sort()) {
  listingCSVs[basename(f, ".csv").toLowerCase()] = read(join(listingDir, f));
}

const brandsPath = join(dataDir, "brands.csv");
const { data, problems, stats } = buildData({
  shopsCSV: read(join(dataDir, "shops.csv")),
  brandsCSV: existsSync(brandsPath) ? read(brandsPath) : "",
  productsCSV: read(join(dataDir, "products.csv")),
  listingCSVs
});

const errors = problems.filter(p => p.level === "error");
const warns = problems.filter(p => p.level === "warn");
for (const p of problems) console.log(`${p.level === "error" ? "ERROR" : "warn "}  ${p.where}  ${p.msg}`);
console.log(`\n${Object.keys(listingCSVs).length} shop files · ${stats.listings} listings · ${stats.matched} matched · ${stats.unmatched.length} unmatched · ${stats.sold} sold/on hold · ${stats.skipped} skipped`);
console.log(`${stats.items} of ${stats.products} products have at least one listing${stats.withoutListings.length ? ` (none for: ${stats.withoutListings.join(", ")})` : ""}`);
console.log(`${errors.length} errors · ${warns.length} warnings`);

// Unmatched listings go to a file so they can be added to products.csv
const reportDir = join(root, "build");
mkdirSync(reportDir, { recursive: true });
writeFileSync(join(reportDir, "unmatched.csv"), toCSV(["shop", "line", "sku", "brand", "name", "ref"],
  stats.unmatched.map(u => [u.shop, u.line, u.sku, u.brand, u.name, u.ref])));
if (stats.unmatched.length) console.log(`Unmatched listings written to build/unmatched.csv`);

if (errors.length) { console.error("\nNot written: fix the errors above first."); process.exit(1); }
if (args.has("--strict") && warns.length) { console.error("\nNot written: --strict and there are warnings."); process.exit(1); }

const js = renderDataJS(data);
if (args.has("--check")) {
  const current = existsSync(out) ? read(out) : "";
  if (current !== js) { console.error("\nassets/data.js is out of date. Run `npm run build:data` and commit the result."); process.exit(1); }
  console.log("\nassets/data.js is up to date.");
} else {
  writeFileSync(out, js);
  console.log(`\nWrote assets/data.js`);
}
