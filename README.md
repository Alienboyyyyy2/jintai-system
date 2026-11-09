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
assets/data.js    sample shops + items  ← replace with a real feed (same shape)
assets/i18n.js    EN / JA strings
assets/app.js     state, pricing rules, routing, rendering
assets/app.css    design tokens and layout
```

## Run locally
Any static server works, e.g. `python3 -m http.server` and open http://localhost:8000.

## Data note
All shops, prices, stock and price history are fictional sample data. Exchange rates are fixed demo values.
