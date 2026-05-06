const PDF_TEXT_REPLACEMENTS: Record<string, string> = {
  "\u00a0": " ",
  "\u00b7": "-",
  "\u2013": "-",
  "\u2014": "-",
  "\u2018": "'",
  "\u2019": "'",
  "\u201c": "\"",
  "\u201d": "\"",
  "\u2022": "*",
  "\u2026": "...",
  "\u20b1": "PHP ",
  "\u2212": "-",
  "\u00d7": "x"
};

export function toPdfText(value: string) {
  let text = "";
  for (const char of value.normalize("NFKD")) {
    const replacement = PDF_TEXT_REPLACEMENTS[char];
    if (replacement !== undefined) {
      text += replacement;
      continue;
    }

    const code = char.charCodeAt(0);
    if (code >= 0x0300 && code <= 0x036f) continue;
    if (code >= 0x20 && code <= 0x7e) text += char;
  }
  return text.replace(/\s+/g, " ").trim();
}

export function formatPdfMoney(value: number | null | undefined, currency = "PHP") {
  if (value === null || value === undefined || !Number.isFinite(value)) return "TBD";
  const code = currency.toUpperCase();
  const amount = new Intl.NumberFormat("en-PH", {
    maximumFractionDigits: value % 1 === 0 ? 0 : 2
  }).format(value);
  return `${code} ${amount}`;
}
