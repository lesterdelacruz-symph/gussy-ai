import type { FurnitureAsset } from "./types";

export interface FirestoreDocument {
  name: string;
  fields?: Record<string, FirestoreValue>;
  createTime?: string;
  updateTime?: string;
}

export type FirestoreValue =
  | { stringValue: string }
  | { integerValue: string }
  | { doubleValue: number }
  | { booleanValue: boolean }
  | { timestampValue: string }
  | { nullValue: null }
  | { arrayValue: { values?: FirestoreValue[] } }
  | { mapValue: { fields?: Record<string, FirestoreValue> } };

export interface FirestoreProductsPage {
  documents?: FirestoreDocument[];
  nextPageToken?: string;
  error?: { message?: string };
}

interface FirestoreProduct {
  id: string;
  name?: string;
  sku?: string;
  active?: boolean;
  status?: string;
  supplier?: string;
  dimensions?: string;
  width?: number;
  depth?: number;
  height?: number;
  material?: string;
  colors?: string | string[];
  tags?: string | string[];
  description?: string;
  imgUrl?: string;
  imgUrls?: string[];
  price?: number;
  salePrice?: number;
  saleDiscount?: number;
  isOnSale?: boolean;
}

export function firestoreDocumentToCatalogAsset(document: FirestoreDocument): FurnitureAsset | null {
  const product = productFromFirestoreDocument(document);
  if (!shouldUseProduct(product)) return null;
  const imageUrl = imageUrlForProduct(product);
  if (!imageUrl) return null;

  return {
    id: `catalog:${product.id}`,
    firebaseDocId: product.id,
    name: String(product.name || product.sku || product.id).trim(),
    category: inferCategory(product),
    src: imageUrl,
    naturalWidth: 1408,
    naturalHeight: 768,
    catalog: true,
    sku: nullableString(product.sku),
    supplier: nullableString(product.supplier),
    dimensions: nullableString(product.dimensions),
    material: nullableString(product.material),
    colors: nullableString(product.colors),
    tags: nullableString(product.tags),
    currency: "PHP",
    retailPrice: numberOrNull(product.price),
    salePrice: numberOrNull(product.salePrice),
    displayPrice: displayPriceForProduct(product)
  };
}

export function productFromFirestoreDocument(document: FirestoreDocument): FirestoreProduct {
  return {
    id: document.name.split("/").pop() ?? document.name,
    ...(decodeFirestoreValue({ mapValue: { fields: document.fields ?? {} } }) as Omit<FirestoreProduct, "id">)
  };
}

export function decodeFirestoreValue(value: FirestoreValue): unknown {
  if ("stringValue" in value) return value.stringValue;
  if ("integerValue" in value) return Number(value.integerValue);
  if ("doubleValue" in value) return Number(value.doubleValue);
  if ("booleanValue" in value) return Boolean(value.booleanValue);
  if ("timestampValue" in value) return value.timestampValue;
  if ("nullValue" in value) return null;
  if ("arrayValue" in value) return (value.arrayValue.values ?? []).map(decodeFirestoreValue);
  if ("mapValue" in value) {
    return Object.fromEntries(
      Object.entries(value.mapValue.fields ?? {}).map(([key, nested]) => [key, decodeFirestoreValue(nested)])
    );
  }
  return null;
}

function shouldUseProduct(product: FirestoreProduct) {
  return product.active === true && String(product.status ?? "").toUpperCase() === "ACTIVE";
}

function imageUrlForProduct(product: FirestoreProduct) {
  return product.imgUrl || product.imgUrls?.[0] || null;
}

function displayPriceForProduct(product: FirestoreProduct) {
  const retailPrice = numberOrNull(product.price);
  const salePrice = numberOrNull(product.salePrice);
  const saleDiscount = numberOrNull(product.saleDiscount) ?? 0;
  const onSale = product.isOnSale === true || saleDiscount > 0;
  return onSale && salePrice !== null ? salePrice : retailPrice;
}

function inferCategory(product: FirestoreProduct) {
  const haystack = `${product.name ?? ""} ${nullableString(product.tags) ?? ""} ${product.description ?? ""}`.toLowerCase();
  if (/(lamp|lighting|droplight|chandelier|pendant|sconce|bulb)/.test(haystack)) return "lighting";
  if (/(rug|carpet|mat|runner)/.test(haystack)) return "rugs";
  if (/(sofa|chair|seat|stool|bench|loveseat|ottoman)/.test(haystack)) return "seating";
  if (/(table|desk|console)/.test(haystack)) return "tables";
  if (/(cabinet|sideboard|shelf|bookshelf|wardrobe|dresser|storage|tv stand)/.test(haystack)) return "storage";
  if (/(mirror|vase|frame|art|decor|sculpture|wallpaper|plant)/.test(haystack)) return "decor";
  return "products";
}

function numberOrNull(value: number | string | null | undefined) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function nullableString(value: string | string[] | null | undefined) {
  if (value === null || value === undefined || value === "") return null;
  return Array.isArray(value) ? value.filter(Boolean).join(", ") : String(value);
}
