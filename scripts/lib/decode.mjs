// CSV files from Japanese Excel are often Shift_JIS, not UTF-8. Try UTF-8 strictly, then Shift_JIS.
export function decodeText(bytes) {
  try { return { text: new TextDecoder("utf-8", { fatal: true }).decode(bytes), encoding: "UTF-8" }; }
  catch (_) { return { text: new TextDecoder("shift_jis").decode(bytes), encoding: "Shift_JIS" }; }
}
