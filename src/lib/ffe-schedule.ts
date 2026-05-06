import type { CanvasState, FurnitureAsset } from "./types";
import { getFurnitureAssetFromList } from "./furniture-assets";
import { displayUploadedAssetName } from "./uploaded-assets";

export interface FFEScheduleRow {
  assetId: string;
  name: string;
  category: string;
  quantity: number;
  unitPrice: number | null;
  totalPrice: number | null;
  currency: string;
  supplier?: string | null;
  sku?: string | null;
  dimensions?: string | null;
  material?: string | null;
  imageUrl?: string | null;
}

export interface FFEScheduleSummary {
  rows: FFEScheduleRow[];
  total: number;
  pricedItemCount: number;
  currency: string;
}

export function buildFFESchedule(canvas: CanvasState, assets: FurnitureAsset[], fallbackCurrency = "PHP"): FFEScheduleSummary {
  const grouped = new Map<string, { asset: FurnitureAsset | null; quantity: number }>();

  for (const item of canvas.items) {
    const existing = grouped.get(item.assetId);
    if (existing) {
      existing.quantity += 1;
      continue;
    }
    grouped.set(item.assetId, {
      asset: getFurnitureAssetFromList(item.assetId, assets),
      quantity: 1
    });
  }

  const rows = [...grouped.entries()]
    .map(([assetId, item]) => {
      const unitPrice = item.asset?.displayPrice ?? null;
      const currency = item.asset?.currency ?? fallbackCurrency;
      const name = item.asset?.uploaded ? displayUploadedAssetName(item.asset.name, assetId) : item.asset?.name;
      return {
        assetId,
        name: name ?? fallbackAssetName(assetId),
        category: item.asset?.category ?? "unknown",
        quantity: item.quantity,
        unitPrice,
        totalPrice: unitPrice === null ? null : unitPrice * item.quantity,
        currency,
        supplier: item.asset?.supplier,
        sku: item.asset?.sku,
        dimensions: item.asset?.dimensions,
        material: item.asset?.material,
        imageUrl: item.asset?.src
      };
    })
    .sort((left, right) => left.category.localeCompare(right.category) || left.name.localeCompare(right.name));

  return {
    rows,
    total: rows.reduce((sum, row) => sum + (row.totalPrice ?? 0), 0),
    pricedItemCount: rows.filter((row) => row.unitPrice !== null).reduce((sum, row) => sum + row.quantity, 0),
    currency: rows.find((row) => row.currency)?.currency ?? fallbackCurrency
  };
}

function fallbackAssetName(assetId: string) {
  return assetId.startsWith("upload_") ? "Uploaded asset" : assetId;
}

export function formatMoney(value: number | null | undefined, currency = "PHP") {
  if (value === null || value === undefined || !Number.isFinite(value)) return "TBD";
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency,
    maximumFractionDigits: value % 1 === 0 ? 0 : 2
  }).format(value);
}
