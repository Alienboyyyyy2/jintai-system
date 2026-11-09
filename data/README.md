# 商品データ（CSV）の取り込み

サイトの商品・価格は、このフォルダのCSVから作ります。CSVを直したら、次のコマンドで `assets/data.js` を作り直します。

```
npm run build:data
```

エラーがあると `assets/data.js` は書き換わりません。表示されたファイル名と行番号を見て直してください。

## ファイル

| ファイル | 中身 | 誰が用意する |
|---|---|---|
| `shops.csv` | ショップの一覧 | 運営 |
| `products.csv` | 商品カタログ（比較の単位） | 運営 |
| `brands.csv` | ブランド名の別表記（シャネル → Chanel など） | 運営 |
| `listings/<ショップID>.csv` | 各ショップの出品データ | ショップ（1店舗1ファイル） |

`listings/` のファイル名は `shops.csv` の `id` と同じにします（例：`listings/kotori.csv`）。ひな形は `templates/listings-template.csv` です。

## 出品データ `listings/<ショップID>.csv`

| 列 | 必須 | 書き方の例 | メモ |
|---|---|---|---|
| `sku` | | `KOT-1001` | ショップ内の管理番号 |
| `brand` | ○ | `シャネル` / `CHANEL` | `brands.csv` の別表記も使えます |
| `name` | ○ | `マトラッセ チェーンショルダー ミディアム` | 型番がないときはこの名前で商品を探します |
| `ref` | | `126610LN` / `１２６６１０ ＬＮ` | 型番。あれば最優先で照合します。全角・空白・記号は無視 |
| `grade` | ○ | `A` / `Aランク` / `美品` / `未使用` | S・A・AB・B・C に揃えます |
| `price` | ○ | `1298000` / `"1,298,000"` / `¥1,298,000` / `1,298,000円(税込)` | **税込**の円。カンマを入れるときは `"` で囲む |
| `store_pickup` | | `yes` / `no` / `○` / `×` | 店頭受取。空欄は yes 扱い |
| `ships_overseas` | | `yes` / `no` | 海外発送。列がなければショップの設定に従います |
| `shipping_fee` | | `6800` | 海外送料（アジア向けの基本料金）。北米×1.5、欧州×1.6、オセアニア×1.4 で計算 |
| `accessories` | | `箱;保存袋;ギャランティ;レシート` | `;` `、` `・` 区切り。英語（box, dust bag, papers, receipt）も可 |
| `listed_on` | | `2026-11-01` / `2026/11/1` / `2026年11月1日` | 掲載日。サイトでは「◯日前」と表示 |
| `status` | | `available` / `売約済` / `商談中` / `sold` | 売約済・商談中・sold は取り込みません |

Excel で保存するときは「CSV UTF-8」を選んでください。

## 商品の照合ルール

1. `ref`（型番）が `products.csv` の `ref` と一致すれば、その商品にまとめます。
2. 型番がなければ、ブランド＋商品名が `products.csv` の `name_en`・`name_ja`・`aliases` のどれかと一致する商品にまとめます（全角半角・大文字小文字・空白・記号の違いは無視）。
3. どれにも一致しない出品は取り込まれず、`build/unmatched.csv` に書き出されます。`products.csv` に商品を追加するか、`aliases` に別名を足してから、もう一度 `npm run build:data` を実行してください。

同じ商品が1つも出品されていない場合、その商品はサイトに表示されません。

## 商品カタログ `products.csv`

必須の列は `id, brand, category, name_en, name_ja` です。`category` は `Bags`・`Watches`・`Accessories`・`Apparel`・`Shoes` のどれか。そのほか `mono`（サムネイルの文字）、`sub_en/sub_ja`（色や素材などの補足）、`ref, year, size, material_en, material_ja`、`keywords`（検索用）、`aliases`（照合用の別名、`;` 区切り）があります。

## ショップ `shops.csv`

`id` は半角英小文字・数字・`-`・`_` のみ。`type` は `chain`・`designer`・`vintage`・`luxury`・`watch`。`languages` は `EN;ZH` のように `;` 区切り。`tax_refund`・`ships_overseas` は yes/no。

## チェック

- `npm test`：取り込み処理のテスト
- `npm run check:data`：CSV と `assets/data.js` がずれていないか確認（GitHub Actions でも自動で実行）
- `npm run build:data -- --strict`：照合できない出品などの警告も失敗として扱う
