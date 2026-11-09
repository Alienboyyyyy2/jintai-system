// CSV checker for shops (#check). Runs the same import code as the build, in the browser.
// Nothing is uploaded: the file is read locally and checked against the product catalogue.
import { buildData } from "../scripts/lib/build.mjs";
import { decodeText } from "../scripts/lib/decode.mjs";

const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const lang = () => document.documentElement.lang === "ja" ? "ja" : "en";
let last = null;      // { shop, fileName, encoding, result }
let catalogue = null; // Promise of { shopsCSV, productsCSV, brandsCSV }

const L = {
  en: {
    reading: "Checking…", loadFail: "Couldn't load the product catalogue, so the file can't be checked here. Try reloading the page.",
    pickShop: "Choose your shop first.", ok: "Ready to send. Every row can be imported.", warn: "Can be sent. Some rows need a look.",
    bad: "Fix the errors below before sending. Rows with errors are not imported.",
    rows: "Rows", willShow: "Will appear", unmatched: "No matching product", sold: "Sold / on hold", errors: "Errors",
    line: "Line", problem: "Problem", preview: "How your listings will appear", item: "Item", grade: "Grade", price: "Price incl. tax",
    shipping: "Overseas", listed: "Listed on", yes: "Ships", no: "Japan only", file: (n, e) => `${n} · ${e}`,
    unmatchedHint: "These rows don't match any product in the catalogue yet. Send them anyway; we'll add the product or ask you about it."
  },
  ja: {
    reading: "チェック中…", loadFail: "商品カタログを読み込めなかったため、ここではチェックできません。ページを再読み込みしてください。",
    pickShop: "先にショップを選んでください。", ok: "送信できます。すべての行を取り込めます。", warn: "送信できます。確認が必要な行があります。",
    bad: "送信前に、下のエラーを直してください。エラーのある行は取り込まれません。",
    rows: "行数", willShow: "掲載される", unmatched: "該当商品なし", sold: "売約済・商談中", errors: "エラー",
    line: "行", problem: "内容", preview: "掲載イメージ", item: "商品", grade: "ランク", price: "税込価格",
    shipping: "海外発送", listed: "掲載日", yes: "可", no: "国内のみ", file: (n, e) => `${n}・文字コード ${e}`,
    unmatchedHint: "カタログにまだ該当する商品がない行です。このまま送ってください。運営側で商品を追加するか、確認のご連絡をします。"
  }
};

// Japanese versions of the import messages shops will see most
const JA = [
  [/^missing column\(s\): (.+)$/, "列が足りません：$1"],
  [/^missing (.+)$/, "必須の項目が空です：$1"],
  [/^unknown condition grade "(.*)".*$/, "ランク「$1」がわかりません（S・A・AB・B・C のどれかにしてください）"],
  [/^condition grade is empty$/, "ランクが空です"],
  [/^price "(.*)" is not a whole number of yen$/, "価格「$1」が円の整数になっていません"],
  [/^price "(.*)" looks too low$/, "価格「$1」が安すぎます。桁を確認してください"],
  [/^shipping fee "(.*)" is not a number$/, "送料「$1」が数字ではありません"],
  [/^(\w+) "(.*)" should be yes or no$/, "$1 の「$2」は yes か no にしてください"],
  [/^unknown accessory "(.*)".*$/, "付属品「$1」がわかりません（箱・保存袋・ギャランティ・レシート）"],
  [/^date "(.*)" should look like .*$/, "日付「$1」は 2026-11-02 の形にしてください"],
  [/^date "(.*)" does not exist$/, "日付「$1」は存在しません"],
  [/^sku (.*) appears more than once$/, "管理番号 $1 が重複しています"],
  [/^no product matches "(.*)".*$/, "「$1」に該当する商品がカタログにありません"],
  [/^ships overseas but shipping_fee is empty.*$/, "海外発送ありですが送料が空です（送料無料として表示されます）"],
  [/^listing ships overseas but the shop is marked as not shipping overseas$/, "海外発送ありになっていますが、ショップ設定は海外発送なしです"],
  [/^matched product (\d+) by reference but brand "(.*)" differs from "(.*)"$/, "型番で商品 $1 に一致しましたが、ブランド「$2」が「$3」と違います"],
  [/^CSV ends inside a quoted field$/, "\" で囲まれた項目が閉じられていません"]
];
const msg = m => lang() === "ja" ? JA.reduce((s, [re, to]) => re.test(s) ? s.replace(re, to) : s, m) : m;

function loadCatalogue() {
  if (!catalogue) {
    const get = f => fetch(f).then(r => { if (!r.ok) throw new Error(f); return r.arrayBuffer(); }).then(b => decodeText(new Uint8Array(b)).text);
    catalogue = Promise.all([get("data/shops.csv"), get("data/products.csv"), get("data/brands.csv").catch(() => "")])
      .then(([shopsCSV, productsCSV, brandsCSV]) => ({ shopsCSV, productsCSV, brandsCSV }));
    catalogue.catch(() => { catalogue = null; });
  }
  return catalogue;
}

async function check(file) {
  const out = $("checkOut"), t = L[lang()];
  const shop = $("checkShop") && $("checkShop").value;
  if (!shop) { out.innerHTML = `<p class="ck-msg bad">${t.pickShop}</p>`; return; }
  out.innerHTML = `<p class="ck-msg">${t.reading}</p>`;
  let cat;
  try { cat = await loadCatalogue(); } catch (_) { out.innerHTML = `<p class="ck-msg bad">${t.loadFail}</p>`; return; }
  const { text, encoding } = decodeText(new Uint8Array(await file.arrayBuffer()));
  let result;
  try { result = buildData({ ...cat, listingCSVs: { [shop]: text } }); }
  catch (e) { result = { data: { ITEMS: [] }, problems: [{ level: "error", where: `listings/${shop}.csv`, msg: e.message }], stats: { listings: 0, matched: 0, sold: 0, skipped: 0, unmatched: [] } }; }
  // Only report this shop's file, not catalogue warnings
  result.problems = result.problems.filter(p => p.where.startsWith(`listings/${shop}.csv`));
  last = { shop, fileName: file.name, encoding, result };
  show();
}

function show() {
  const out = $("checkOut");
  if (!out || !last) return;
  const t = L[lang()], { result: r, shop } = last;
  const errs = r.problems.filter(p => p.level === "error"), warns = r.problems.filter(p => p.level === "warn");
  const state = errs.length ? "bad" : warns.length ? "warn" : "ok";
  const offers = r.data.ITEMS.flatMap(it => it.offers.filter(o => o[0] === shop).map(o => ({ it, o })));
  const name = it => lang() === "ja" ? it.nj : it.name;
  const yen = v => "¥" + v.toLocaleString("en-US");
  out.innerHTML = `
    <p class="ck-file">${esc(t.file(last.fileName, last.encoding))}</p>
    <p class="ck-msg ${state}">${t[state]}</p>
    <div class="ck-stats">
      <div><span>${t.rows}</span><strong>${r.stats.listings}</strong></div>
      <div><span>${t.willShow}</span><strong class="ok">${r.stats.matched}</strong></div>
      <div><span>${t.unmatched}</span><strong>${r.stats.unmatched.length}</strong></div>
      <div><span>${t.sold}</span><strong>${r.stats.sold}</strong></div>
      <div><span>${t.errors}</span><strong class="${errs.length ? "bad" : ""}">${errs.length}</strong></div>
    </div>
    ${r.problems.length ? `<div class="table-wrap"><table class="ck-table"><thead><tr><th>${t.line}</th><th>${t.problem}</th></tr></thead><tbody>
      ${r.problems.map(p => `<tr class="${p.level}"><td class="num">${esc((p.where.split(":")[1]) || "—")}</td><td>${p.level === "error" ? "⛔ " : "⚠️ "}${esc(msg(p.msg))}</td></tr>`).join("")}
    </tbody></table></div>${r.stats.unmatched.length ? `<p class="muted sm">${t.unmatchedHint}</p>` : ""}` : ""}
    ${offers.length ? `<h3 class="h2s">${t.preview}</h3><div class="table-wrap"><table class="ck-table"><thead><tr><th>${t.item}</th><th>${t.grade}</th><th class="num">${t.price}</th><th>${t.shipping}</th><th>${t.listed}</th></tr></thead><tbody>
      ${offers.map(({ it, o }) => `<tr><td><strong>${esc(it.brand)}</strong> ${esc(name(it))}</td><td><span class="grade">${o[1]}</span></td><td class="num">${yen(o[2])}</td><td>${o[4] ? `${t.yes} · ${yen(o[5])}` : t.no}</td><td>${o[7] || "—"}</td></tr>`).join("")}
    </tbody></table></div>` : ""}`;
}

document.addEventListener("change", e => {
  if (e.target.id === "csvFile" && e.target.files[0]) check(e.target.files[0]);
  if (e.target.id === "checkShop" && last && $("csvFile") && $("csvFile").files[0]) check($("csvFile").files[0]);
});
document.addEventListener("dragover", e => { const z = e.target.closest && e.target.closest("#dropZone"); if (z) { e.preventDefault(); z.classList.add("over"); } });
document.addEventListener("dragleave", e => { const z = e.target.closest && e.target.closest("#dropZone"); if (z) z.classList.remove("over"); });
document.addEventListener("drop", e => {
  const z = e.target.closest && e.target.closest("#dropZone");
  if (!z) return;
  e.preventDefault(); z.classList.remove("over");
  const f = e.dataTransfer.files[0];
  if (f) check(f);
});
// The app re-renders views (e.g. on language change); put the last result back.
document.addEventListener("tsugi:render", e => {
  if (e.detail.view !== "check") return;
  if (last && $("checkShop")) $("checkShop").value = last.shop;
  show();
  loadCatalogue().catch(() => {});
});
