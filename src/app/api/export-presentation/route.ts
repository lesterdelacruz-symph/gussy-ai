import { NextRequest, NextResponse } from "next/server";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import type { PDFImage, PDFFont, PDFPage, PDFPageDrawTextOptions } from "pdf-lib";
import { formatPdfMoney, toPdfText } from "@/lib/pdf-text";
import { assertProjectOwner, getAuthenticatedUser } from "@/lib/supabase-server";
import type { GeneratedRender } from "@/lib/types";

interface ExportScheduleRow {
  name: string;
  quantity: number;
  unitPrice: number | null;
  totalPrice: number | null;
  currency: string;
  supplier?: string | null;
  sku?: string | null;
  dimensions?: string | null;
  material?: string | null;
}

interface ExportSchedule {
  rows: ExportScheduleRow[];
  total: number;
  currency: string;
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      projectId?: string;
      canvasImage?: string;
      renders?: GeneratedRender[];
      schedule?: ExportSchedule;
      budget?: { amount: number | null; currency: string };
    };

    if (!body.projectId || !body.canvasImage || !body.schedule) {
      return NextResponse.json({ error: "projectId, canvasImage, and schedule are required" }, { status: 400 });
    }

    const { user, client } = await getAuthenticatedUser(request);
    await assertProjectOwner(body.projectId, user.id, client);
    const { data: projectRow, error: projectError } = await client
      .from("projects")
      .select("name")
      .eq("id", body.projectId)
      .maybeSingle();
    if (projectError) throw new Error(projectError.message);

    const pdfBytes = await buildPresentationPdf({
      projectId: body.projectId,
      projectName: typeof projectRow?.name === "string" ? projectRow.name : "Untitled Project",
      canvasImage: body.canvasImage,
      renders: body.renders ?? [],
      schedule: body.schedule,
      budget: body.budget ?? { amount: null, currency: body.schedule.currency }
    });

    const fileName = `${sanitizeFileName(typeof projectRow?.name === "string" ? projectRow.name : "gussy-presentation")}.pdf`;
    return new NextResponse(Buffer.from(pdfBytes), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${fileName}"`,
        "Cache-Control": "no-store"
      }
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to export presentation" },
      { status: authStatus(error) }
    );
  }
}

async function buildPresentationPdf(input: {
  projectId: string;
  projectName: string;
  canvasImage: string;
  renders: GeneratedRender[];
  schedule: ExportSchedule;
  budget: { amount: number | null; currency: string };
}) {
  const pdf = await PDFDocument.create();
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const pageSize: [number, number] = [842, 595];
  const ink = rgb(0.16, 0.15, 0.13);
  const muted = rgb(0.45, 0.42, 0.38);
  const accent = rgb(0.19, 0.36, 0.34);

  const cover = pdf.addPage(pageSize);
  drawTitle(cover, bold, regular, input.projectName, "Gussy Studio client presentation", 44, 548);
  const canvasImage = await embedImage(pdf, input.canvasImage);
  drawImageFit(cover, canvasImage, 44, 150, 520, 340);
  drawSafeText(cover, "Budget summary", { x: 600, y: 470, size: 16, font: bold, color: ink });
  drawSafeText(cover, `Estimated total: ${formatPdfMoney(input.schedule.total, input.schedule.currency)}`, {
    x: 600,
    y: 440,
    size: 11,
    font: regular,
    color: ink
  });
  const remaining = input.budget.amount === null ? null : input.budget.amount - input.schedule.total;
  drawSafeText(
    cover,
    input.budget.amount === null
      ? "Budget target: Not set"
      : `Budget target: ${formatPdfMoney(input.budget.amount, input.budget.currency)}`,
    { x: 600, y: 420, size: 11, font: regular, color: muted }
  );
  drawSafeText(
    cover,
    remaining === null
      ? "Budget status: Set a target to compare"
      : `${remaining >= 0 ? "Remaining" : "Over budget"}: ${formatPdfMoney(Math.abs(remaining), input.budget.currency)}`,
    { x: 600, y: 400, size: 11, font: regular, color: remaining !== null && remaining < 0 ? rgb(0.65, 0.29, 0.19) : accent }
  );

  if (input.renders.length > 0) {
    const rendersPage = pdf.addPage(pageSize);
    drawTitle(rendersPage, bold, regular, "Generated Views", "Selected photo-realistic render angles", 44, 548);
    const boxes = [
      [44, 315, 360, 190],
      [438, 315, 360, 190],
      [44, 80, 360, 190],
      [438, 80, 360, 190]
    ];
    for (const [index, render] of input.renders.slice(0, 4).entries()) {
      const image = await embedImage(pdf, render.url);
      const [x, y, width, height] = boxes[index];
      drawImageFit(rendersPage, image, x, y, width, height);
      drawSafeText(rendersPage, render.angleLabel ?? `Version ${index + 1}`, { x, y: y - 18, size: 11, font: bold, color: ink });
    }
  }

  let schedulePage = pdf.addPage(pageSize);
  drawTitle(schedulePage, bold, regular, "FF&E Schedule", "Client-facing product list and budget estimate", 44, 548);
  let y = 495;
  drawTableHeader(schedulePage, bold, 44, y);
  y -= 24;
  for (const row of input.schedule.rows) {
    if (y < 70) {
      schedulePage = pdf.addPage(pageSize);
      drawTitle(schedulePage, bold, regular, "FF&E Schedule", "continued", 44, 548);
      y = 495;
      drawTableHeader(schedulePage, bold, 44, y);
      y -= 24;
    }
    drawSafeText(schedulePage, truncate(row.name, 28), { x: 44, y, size: 9, font: bold, color: ink });
    drawSafeText(schedulePage, String(row.quantity), { x: 245, y, size: 9, font: regular, color: ink });
    drawSafeText(schedulePage, formatPdfMoney(row.unitPrice, row.currency), { x: 285, y, size: 9, font: regular, color: ink });
    drawSafeText(schedulePage, formatPdfMoney(row.totalPrice, row.currency), { x: 375, y, size: 9, font: bold, color: ink });
    drawSafeText(schedulePage, truncate(row.sku ?? "", 16), { x: 475, y, size: 9, font: regular, color: muted });
    drawSafeText(schedulePage, truncate(row.supplier ?? "", 20), { x: 585, y, size: 9, font: regular, color: muted });
    y -= 16;
    const details = [row.dimensions, row.material].filter(Boolean).join(" · ");
    if (details) {
      drawSafeText(schedulePage, truncate(details, 94), { x: 44, y, size: 8, font: regular, color: muted });
      y -= 14;
    }
    y -= 4;
  }
  drawSafeText(schedulePage, `Estimated total: ${formatPdfMoney(input.schedule.total, input.schedule.currency)}`, {
    x: 590,
    y: 36,
    size: 12,
    font: bold,
    color: accent
  });

  return pdf.save();
}

function drawTitle(page: PDFPage, bold: PDFFont, regular: PDFFont, title: string, subtitle: string, x: number, y: number) {
  drawSafeText(page, title, { x, y, size: 22, font: bold, color: rgb(0.16, 0.15, 0.13) });
  drawSafeText(page, subtitle, { x, y: y - 22, size: 10, font: regular, color: rgb(0.45, 0.42, 0.38) });
}

function drawTableHeader(page: PDFPage, bold: PDFFont, x: number, y: number) {
  drawSafeText(page, "Item", { x, y, size: 9, font: bold, color: rgb(0.45, 0.42, 0.38) });
  drawSafeText(page, "Qty", { x: 245, y, size: 9, font: bold, color: rgb(0.45, 0.42, 0.38) });
  drawSafeText(page, "Unit", { x: 285, y, size: 9, font: bold, color: rgb(0.45, 0.42, 0.38) });
  drawSafeText(page, "Total", { x: 375, y, size: 9, font: bold, color: rgb(0.45, 0.42, 0.38) });
  drawSafeText(page, "SKU", { x: 475, y, size: 9, font: bold, color: rgb(0.45, 0.42, 0.38) });
  drawSafeText(page, "Supplier", { x: 585, y, size: 9, font: bold, color: rgb(0.45, 0.42, 0.38) });
}

function drawSafeText(page: PDFPage, text: string, options: PDFPageDrawTextOptions) {
  page.drawText(toPdfText(text), options);
}

async function embedImage(pdf: PDFDocument, source: string) {
  const { bytes, mimeType } = await imageBytes(source);
  if (mimeType.includes("jpeg") || mimeType.includes("jpg")) return pdf.embedJpg(bytes);
  return pdf.embedPng(bytes);
}

async function imageBytes(source: string) {
  if (source.startsWith("data:")) {
    const [header, payload] = source.split(",");
    return {
      bytes: Buffer.from(payload, "base64"),
      mimeType: header.match(/^data:(.*?);base64$/)?.[1] ?? "image/png"
    };
  }
  const response = await fetch(source);
  if (!response.ok) throw new Error("Presentation image could not be loaded.");
  return {
    bytes: Buffer.from(await response.arrayBuffer()),
    mimeType: response.headers.get("content-type") ?? "image/png"
  };
}

function drawImageFit(page: PDFPage, image: PDFImage, x: number, y: number, width: number, height: number) {
  const scale = Math.min(width / image.width, height / image.height);
  const drawWidth = image.width * scale;
  const drawHeight = image.height * scale;
  page.drawImage(image, {
    x: x + (width - drawWidth) / 2,
    y: y + (height - drawHeight) / 2,
    width: drawWidth,
    height: drawHeight
  });
}

function truncate(value: string, length: number) {
  return value.length > length ? `${value.slice(0, length - 3)}...` : value;
}

function sanitizeFileName(value: string) {
  return toPdfText(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "gussy-presentation";
}

function authStatus(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  return message.includes("Authentication") || message.includes("session") ? 401 : message.includes("Project not found") ? 404 : 500;
}
