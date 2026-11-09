# Tsugi — Japan resale price comparison

A working prototype that compares the same pre-owned item across Japanese resale shops.

## Features
- **Search** by brand, model, reference number, or Japanese keywords; category chips with counts
- **Filters**: condition grade, price range (in the selected currency), brand, shop, "comes with box or papers"
- **Buying mode** changes every price on the site:
  - *Visitor in Japan*: in-store price minus the 10% consumption-tax refund (refund system from 1 Nov 2026, ¥5,000 minimum)
  - *Japan resident*: tag price incl. tax
  - *Ship overseas*: tax-free export price + estimated shipping to the chosen country (duties not included)
- **Item page**: specs, per-shop offer table (grade, accessories, availability, listing age, price breakdown), price-spread strip, 26-week price history chart, price alert
- **Watchlist** with alerts, **recently viewed**, **similar items**
- **Shop directory** and **buying guide** (grades, tax refund, shipping, authenticity)
- English / Japanese UI, 11 currencies, light and dark themes, phone layout
- Shareable views via hash: `#search`, `#item-<id>`, `#shops`, `#watchlist`, `#guide`

## Structure
```
index.html        page shell (published as an Artifact; the host adds <html>/<head>/<body>)
data/             CSV source data: shops, product catalogue, one listings file per shop
scripts/          CSV import: validate, normalise, match listings to products, write assets/data.js
tests/            import tests (node --test)
assets/data.js    GENERATED from data/*.csv — do not edit by hand
assets/i18n.js    EN / JA strings
assets/app.js     state, pricing rules, routing, rendering
assets/app.css    design tokens and layout
```

## Updating the data
Edit the CSV files in `data/` (see `data/README.md` for the format, in Japanese), then:
```
npm run build:data   # validate, match and write assets/data.js
npm test             # import tests
npm run build:site   # assemble the deployable site in _site/
```
Shops can send their listings as a CSV (Excel "CSV UTF-8" is fine). Grades, prices, dates and
accessories are accepted in common Japanese and English forms. Listings that match no product are
written to `build/unmatched.csv`.

## Automatic publishing (GitHub Pages)
Upload a shop's CSV into `data/listings/` on `main` (GitHub web: **Add file → Upload files**).
The **Deploy** workflow then imports all CSVs, commits the rebuilt `assets/data.js`, and publishes
the site to GitHub Pages. If any CSV has errors, nothing is published and the run summary lists
each bad row. Branches and pull requests get the same checks from the **CI** workflow.

One-time setup: repository **Settings → Pages → Build and deployment → Source: GitHub Actions**.

Shops can check a file before sending it on the site's **CSV check** page (`#check`). It runs the
same import code in the browser, accepts UTF-8 or Shift_JIS, and uploads nothing.

## Run locally
`npm run build:site`, then serve `_site/` with any static server (e.g. `cd _site && python3 -m http.server`)
and open http://localhost:8000. The CSV check page needs a server (it loads ES modules and CSVs).

## Data note
All shops, prices, stock and price history are fictional sample data. Exchange rates are fixed demo values.
