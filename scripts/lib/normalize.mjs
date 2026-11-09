// Turns the many ways shops write the same thing into one value.
// Each parser returns { value } or { error } so the build can report the exact row.

const nfkc = s => String(s ?? "").normalize("NFKC").trim();

// Text used only for matching: full-width -> half-width, lower case, no spaces or punctuation.
export function matchKey(s) {
  return nfkc(s).toLowerCase().replace(/[\s\p{P}\p{S}]+/gu, "");
}

// Reference / model numbers: "126610 ln", "１２６６１０ＬＮ", "126610-LN" -> "126610LN"
export function refKey(s) {
  const k = nfkc(s).toUpperCase().replace(/[^0-9A-Z]/g, "");
  return k.length >= 3 ? k : ""; // "—", "-", "なし" etc. mean no reference
}

const GRADE_WORDS = { "未使用": "S", "新品": "S", "新品同様": "S", "美品": "A", "良品": "AB", "中古": "B", "難あり": "C", "ジャンク": "C" };
const GRADES = ["S", "A", "AB", "B", "C"];

// "A", "Aランク", "ランクAB", "rank b", "美品", "SA" (some shops) -> S | A | AB | B | C
export function parseGrade(s) {
  const raw = nfkc(s);
  if (!raw) return { error: "condition grade is empty" };
  if (GRADE_WORDS[raw]) return { value: GRADE_WORDS[raw] };
  let g = raw.toUpperCase().replace(/ランク|RANK|\s/g, "");
  if (g === "SA" || g === "NS" || g === "N") g = g === "SA" ? "A" : "S";
  if (GRADES.includes(g)) return { value: g };
  return { error: `unknown condition grade "${raw}" (use S, A, AB, B or C)` };
}

// "¥1,298,000", "1298000円", "１，２９８，０００" -> 1298000 (yen, integer)
export function parsePrice(s) {
  const raw = nfkc(s);
  const digits = raw.replace(/[(（]?税込[)）]?|[¥￥円,\s]|JPY/gi, "");
  if (!/^\d+$/.test(digits)) return { error: `price "${raw}" is not a whole number of yen` };
  const v = +digits;
  if (v < 100) return { error: `price "${raw}" looks too low` };
  return { value: v };
}

// Optional fee: empty -> 0
export function parseFee(s) {
  const raw = nfkc(s);
  if (!raw) return { value: 0 };
  return parsePrice(raw).error ? { error: `shipping fee "${raw}" is not a number` } : parsePrice(raw);
}

const YES = ["yes", "y", "true", "1", "○", "◯", "可", "あり", "有"];
const NO = ["no", "n", "false", "0", "×", "x", "不可", "なし", "無", ""];
export function parseBool(s, label) {
  const v = nfkc(s).toLowerCase();
  if (YES.includes(v)) return { value: true };
  if (NO.includes(v)) return { value: false };
  return { error: `${label} "${s}" should be yes or no` };
}

// "箱;保存袋;ギャランティ" / "box, dust bag" -> "bdc"  (b box, d dust bag, c papers, r receipt)
const ACC = [
  ["b", ["box", "箱", "外箱", "化粧箱", "bx"]],
  ["d", ["dustbag", "dust bag", "保存袋", "袋", "dust"]],
  ["c", ["papers", "paper", "card", "guarantee", "warranty", "ギャランティ", "ギャランティカード", "保証書", "ギャラ", "カード"]],
  ["r", ["receipt", "レシート", "購入証明", "領収書"]]
];
export function parseAccessories(s) {
  const raw = nfkc(s);
  if (!raw || /^(なし|本体のみ|none|-)$/i.test(raw)) return { value: "" };
  const out = new Set();
  for (const part of raw.split(/[;,、・/|]+/).map(p => p.trim().toLowerCase()).filter(Boolean)) {
    const hit = ACC.find(([, words]) => words.includes(part));
    if (!hit) return { error: `unknown accessory "${part}" (use box, dust bag, papers, receipt)` };
    out.add(hit[0]);
  }
  return { value: "bdcr".split("").filter(c => out.has(c)).join("") };
}

// "2026-11-02", "2026/11/2", "2026年11月2日" -> "2026-11-02"
export function parseDate(s) {
  const raw = nfkc(s);
  const m = /^(\d{4})[-/年.](\d{1,2})[-/月.](\d{1,2})日?$/.exec(raw);
  if (!m) return { error: `date "${raw}" should look like 2026-11-02` };
  const [y, mo, d] = [+m[1], +m[2], +m[3]];
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return { error: `date "${raw}" does not exist` };
  return { value: `${m[1]}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}` };
}

const SOLD = ["sold", "soldout", "売約済", "売約済み", "売切", "売り切れ", "sold out", "hold", "商談中"];
export function isAvailable(status) {
  const v = nfkc(status).toLowerCase();
  return !SOLD.includes(v) && !SOLD.includes(v.replace(/\s/g, ""));
}
