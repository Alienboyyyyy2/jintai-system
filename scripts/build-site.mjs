#!/usr/bin/env node
// Assembles the static site in _site/ for GitHub Pages.
// index.html is written without <html>/<head>/<body> (the Claude artifact host adds them),
// so this wraps it in the same skeleton for a normal web server.
import { readFileSync, writeFileSync, mkdirSync, rmSync, cpSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const out = join(root, "_site");
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

const page = readFileSync(join(root, "index.html"), "utf8");
const reset = ":root{color-scheme:light;box-sizing:border-box;padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}" +
  "body{margin:0;padding:0;font:14px -apple-system,BlinkMacSystemFont,sans-serif}img{max-width:100%}[hidden]{display:none!important}";
writeFileSync(join(out, "index.html"),
  `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><style>${reset}</style></head><body>\n${page}\n</body></html>\n`);

// Everything the page loads: styles/scripts, the CSV checker's import code and the catalogue CSVs it matches against
cpSync(join(root, "assets"), join(out, "assets"), { recursive: true });
mkdirSync(join(out, "scripts", "lib"), { recursive: true });
for (const f of readdirSync(join(root, "scripts", "lib"))) cpSync(join(root, "scripts", "lib", f), join(out, "scripts", "lib", f));
mkdirSync(join(out, "data"), { recursive: true });
for (const f of ["shops.csv", "products.csv", "brands.csv"]) cpSync(join(root, "data", f), join(out, "data", f));
cpSync(join(root, "data", "templates"), join(out, "data", "templates"), { recursive: true });
writeFileSync(join(out, ".nojekyll"), "");
console.log("Wrote _site/");
