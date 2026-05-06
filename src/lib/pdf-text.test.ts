import { PDFDocument, StandardFonts } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { formatPdfMoney, toPdfText } from "./pdf-text";

describe("PDF text helpers", () => {
  it("uses currency codes instead of symbols that built-in PDF fonts cannot encode", () => {
    expect(formatPdfMoney(24000, "PHP")).toBe("PHP 24,000");
    expect(formatPdfMoney(1999.5, "PHP")).toBe("PHP 1,999.5");
  });

  it("converts common unicode characters to WinAnsi-safe text", async () => {
    const safeText = toPdfText("Total: \u20b124,000 \u2014 designer\u2019s caf\u00e9 table");

    expect(safeText).toBe("Total: PHP 24,000 - designer's cafe table");

    const pdf = await PDFDocument.create();
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    expect(() => font.encodeText(safeText)).not.toThrow();
  });
});
