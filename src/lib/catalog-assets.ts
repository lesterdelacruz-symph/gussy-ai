import type { SupabaseClient } from "@supabase/supabase-js";
import type { FurnitureAsset } from "./types";

export const CATALOG_STORAGE_BUCKET = "catalog-assets";

export interface CatalogItemRow {
  id: string;
  firebase_doc_id: string;
  name: string;
  sku: string | null;
  category: string;
  supplier: string | null;
  dimensions: string | null;
  width: number | string | null;
  depth: number | string | null;
  height: number | string | null;
  material: string | null;
  colors: string | null;
  tags: string | null;
  status: string | null;
  active: boolean;
  currency: string;
  retail_price: number | string | null;
  sale_price: number | string | null;
  display_price: number | string | null;
  source_image_url: string | null;
  public_url: string | null;
  image_width?: number | string | null;
  image_height?: number | string | null;
}

export const CATALOG_SELECT = [
  "id",
  "firebase_doc_id",
  "name",
  "sku",
  "category",
  "supplier",
  "dimensions",
  "width",
  "depth",
  "height",
  "material",
  "colors",
  "tags",
  "status",
  "active",
  "currency",
  "retail_price",
  "sale_price",
  "display_price",
  "source_image_url",
  "public_url",
  "image_width",
  "image_height"
].join(", ");

const CATALOG_PAGE_SIZE = 1000;

export function catalogAssetFromRow(row: CatalogItemRow): FurnitureAsset {
  return {
    id: `catalog:${row.firebase_doc_id}`,
    firebaseDocId: row.firebase_doc_id,
    name: row.name.trim() || row.name,
    category: row.category.trim() || row.category,
    src: row.public_url ?? row.source_image_url ?? "",
    naturalWidth: toNumberOrNull(row.image_width) ?? 1408,
    naturalHeight: toNumberOrNull(row.image_height) ?? 768,
    catalog: true,
    sku: row.sku,
    supplier: row.supplier,
    dimensions: row.dimensions,
    material: row.material,
    colors: row.colors,
    tags: row.tags,
    currency: row.currency,
    retailPrice: toNumberOrNull(row.retail_price),
    salePrice: toNumberOrNull(row.sale_price),
    displayPrice: toNumberOrNull(row.display_price)
  };
}

export async function listCatalogAssets(client: SupabaseClient): Promise<FurnitureAsset[]> {
  const rows: CatalogItemRow[] = [];
  let offset = 0;

  while (true) {
    const { data, error } = await client
      .from("catalog_items")
      .select(CATALOG_SELECT)
      .eq("active", true)
      .order("name", { ascending: true })
      .range(offset, offset + CATALOG_PAGE_SIZE - 1);

    if (error) throw new Error(error.message);

    const page = (data ?? []) as unknown as CatalogItemRow[];
    rows.push(...page);
    if (page.length < CATALOG_PAGE_SIZE) break;
    offset += CATALOG_PAGE_SIZE;
  }

  return rows.map(catalogAssetFromRow).filter((asset) => Boolean(asset.src));
}

function toNumberOrNull(value: number | string | null | undefined) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}
