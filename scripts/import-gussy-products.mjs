#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createClient } from "@supabase/supabase-js";

const FIRESTORE_PROJECT_ID = "project-gussy";
const FIRESTORE_DATABASE = "(default)";
const FIRESTORE_COLLECTION = "products";
const CATALOG_BUCKET = "catalog-assets";
const DEFAULT_PAGE_SIZE = 25;
const MAX_IMAGE_BYTES = 60 * 1024 * 1024;

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}

async function main() {
  loadEnvFile(".env.local");

  const options = parseArgs(process.argv.slice(2));
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://kzgrpjijmsslmevpgtsk.supabase.co";
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const supabase =
    options.dryRun && !serviceRoleKey
      ? null
      : createClient(supabaseUrl, requireServiceRoleKey(serviceRoleKey), {
          auth: { autoRefreshToken: false, persistSession: false }
        });

  const existingImages = supabase ? await loadExistingCatalogImages(supabase) : new Map();
  const imported = [];
  let skipped = 0;
  let pageToken = "";

  while (true) {
    const page = readFirestorePage(getAccessToken(), pageToken, options.pageSize);
    for (const document of page.documents ?? []) {
      if (options.limit && imported.length >= options.limit) break;
      const product = productFromDocument(document);
      if (!shouldImport(product)) {
        skipped += 1;
        continue;
      }

      const sourceImageUrl = imageUrlForProduct(product);
      const existingImage = existingImages.get(product.id);
      const image =
        existingImage && existingImage.sourceImageUrl === sourceImageUrl
          ? existingImage
          : supabase && sourceImageUrl && !options.skipImages && !options.dryRun
          ? await copyImage(supabase, product.id, sourceImageUrl)
          : null;
      const row = buildCatalogRow(product, image);
      imported.push(row.firebase_doc_id);
      if (!options.dryRun) {
        const { error } = await supabase.from("catalog_items").upsert(row, { onConflict: "firebase_doc_id" });
        if (error) throw new Error(`Supabase upsert failed for ${product.id}: ${error.message}`);
        if (image?.storagePath && image?.publicUrl) {
          existingImages.set(product.id, { ...image, sourceImageUrl });
        }
      }
      console.log(`${options.dryRun ? "would import" : "imported"} ${product.id} ${product.name}`);
    }

    if ((options.limit && imported.length >= options.limit) || !page.nextPageToken) break;
    pageToken = page.nextPageToken;
  }

  console.log(JSON.stringify({ imported: imported.length, skipped, dryRun: options.dryRun }, null, 2));
}

async function loadExistingCatalogImages(supabase) {
  const images = new Map();
  let from = 0;
  const pageSize = 1000;

  while (true) {
    const { data, error } = await supabase
      .from("catalog_items")
      .select("firebase_doc_id, source_image_url, image_storage_path, public_url")
      .range(from, from + pageSize - 1);
    if (error) throw new Error(`Could not load existing catalog images: ${error.message}`);

    for (const row of data ?? []) {
      if (row.firebase_doc_id && row.image_storage_path && row.public_url) {
        images.set(row.firebase_doc_id, {
          storagePath: row.image_storage_path,
          publicUrl: row.public_url,
          sourceImageUrl: row.source_image_url
        });
      }
    }

    if (!data || data.length < pageSize) break;
    from += pageSize;
  }

  return images;
}

export function parseArgs(args) {
  const parsed = { dryRun: false, limit: 0, pageSize: DEFAULT_PAGE_SIZE, skipImages: false };
  for (const arg of args) {
    if (arg === "--dry-run") parsed.dryRun = true;
    if (arg === "--skip-images") parsed.skipImages = true;
    if (arg.startsWith("--limit=")) parsed.limit = Number(arg.slice("--limit=".length));
    if (arg.startsWith("--page-size=")) parsed.pageSize = Number(arg.slice("--page-size=".length));
  }
  return parsed;
}

export function loadEnvFile(fileName) {
  const filePath = path.join(process.cwd(), fileName);
  if (!existsSync(filePath)) return;
  const lines = readFileSync(filePath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const [key, ...valueParts] = trimmed.split("=");
    if (process.env[key]) continue;
    process.env[key] = valueParts.join("=").replace(/^['"]|['"]$/g, "");
  }
}

export function getAccessToken() {
  return execFileSync("gcloud", ["auth", "print-access-token"], { encoding: "utf8" }).trim();
}

export function readFirestorePage(accessToken, pageToken, pageSize) {
  const url = new URL(
    `https://firestore.googleapis.com/v1/projects/${FIRESTORE_PROJECT_ID}/databases/${encodeURIComponent(
      FIRESTORE_DATABASE
    )}/documents/${FIRESTORE_COLLECTION}`
  );
  url.searchParams.set("pageSize", String(pageSize));
  if (pageToken) url.searchParams.set("pageToken", pageToken);

  const output = execFileSync("curl", ["-sS", "-H", `Authorization: Bearer ${accessToken}`, url.toString()], {
    encoding: "utf8",
    maxBuffer: 20 * 1024 * 1024
  });
  const parsed = JSON.parse(output);
  if (parsed.error) throw new Error(parsed.error.message || "Firestore request failed.");
  return parsed;
}

export function productFromDocument(document) {
  const id = document.name.split("/").pop();
  return {
    id,
    createTime: document.createTime,
    updateTime: document.updateTime,
    ...decodeFirestoreValue({ mapValue: { fields: document.fields ?? {} } })
  };
}

export function decodeFirestoreValue(value) {
  if ("stringValue" in value) return value.stringValue;
  if ("integerValue" in value) return Number(value.integerValue);
  if ("doubleValue" in value) return Number(value.doubleValue);
  if ("booleanValue" in value) return Boolean(value.booleanValue);
  if ("timestampValue" in value) return value.timestampValue;
  if ("nullValue" in value) return null;
  if ("arrayValue" in value) return (value.arrayValue.values ?? []).map(decodeFirestoreValue);
  if ("mapValue" in value) {
    return Object.fromEntries(Object.entries(value.mapValue.fields ?? {}).map(([key, nested]) => [key, decodeFirestoreValue(nested)]));
  }
  return null;
}

export function shouldImport(product) {
  return product.active === true && String(product.status ?? "").toUpperCase() === "ACTIVE";
}

export function buildCatalogRow(product, image = null) {
  const sourceImageUrl = imageUrlForProduct(product);
  const retailPrice = numberOrNull(product.price);
  const salePrice = numberOrNull(product.salePrice);

  return {
    firebase_doc_id: product.id,
    name: String(product.name || product.sku || product.id),
    sku: nullableString(product.sku),
    category: inferCategory(product),
    supplier: nullableString(product.supplier),
    dimensions: nullableString(product.dimensions),
    width: numberOrNull(product.width),
    depth: numberOrNull(product.depth),
    height: numberOrNull(product.height),
    material: nullableString(product.material),
    colors: nullableString(product.colors),
    tags: nullableString(product.tags),
    status: nullableString(product.status),
    active: product.active === true,
    currency: "PHP",
    retail_price: retailPrice,
    sale_price: salePrice,
    display_price: displayPriceForProduct(product),
    source_image_url: sourceImageUrl,
    image_storage_bucket: CATALOG_BUCKET,
    image_storage_path: image?.storagePath ?? null,
    public_url: image?.publicUrl ?? sourceImageUrl,
    updated_at: new Date().toISOString()
  };
}

export function imageUrlForProduct(product) {
  return product.imgUrl || product.imgUrls?.[0] || null;
}

export function displayPriceForProduct(product) {
  const retailPrice = numberOrNull(product.price);
  const salePrice = numberOrNull(product.salePrice);
  const saleDiscount = numberOrNull(product.saleDiscount) ?? 0;
  const onSale = product.isOnSale === true || saleDiscount > 0;
  return onSale && salePrice !== null ? salePrice : retailPrice;
}

async function copyImage(supabase, docId, sourceUrl) {
  const bytes = execFileSync("curl", ["-L", "-sS", sourceUrl], { maxBuffer: MAX_IMAGE_BYTES });
  const mimeType = inferMimeType(sourceUrl);
  const storagePath = `products/${sanitizePathPart(docId)}/${sanitizePathPart(docId)}.${extensionForMime(mimeType)}`;

  const { error } = await supabase.storage.from(CATALOG_BUCKET).upload(storagePath, bytes, {
    contentType: mimeType,
    upsert: true
  });
  if (error) throw new Error(`Catalog image upload failed for ${docId}: ${error.message}`);

  const { data } = supabase.storage.from(CATALOG_BUCKET).getPublicUrl(storagePath);
  return { storagePath, publicUrl: data.publicUrl };
}

export function inferCategory(product) {
  const haystack = `${product.name ?? ""} ${product.tags ?? ""} ${product.description ?? ""}`.toLowerCase();
  if (/(lamp|lighting|droplight|chandelier|pendant|sconce|bulb)/.test(haystack)) return "lighting";
  if (/(rug|carpet|mat|runner)/.test(haystack)) return "rugs";
  if (/(sofa|chair|seat|stool|bench|loveseat|ottoman)/.test(haystack)) return "seating";
  if (/(table|desk|console)/.test(haystack)) return "tables";
  if (/(cabinet|sideboard|shelf|bookshelf|wardrobe|dresser|storage|tv stand)/.test(haystack)) return "storage";
  if (/(mirror|vase|frame|art|decor|sculpture|wallpaper|plant)/.test(haystack)) return "decor";
  return "products";
}

export function numberOrNull(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export function nullableString(value) {
  if (value === null || value === undefined || value === "") return null;
  return String(value);
}

export function inferMimeType(url) {
  const pathname = new URL(url).pathname.toLowerCase();
  if (pathname.includes(".webp")) return "image/webp";
  if (pathname.includes(".jpg") || pathname.includes(".jpeg")) return "image/jpeg";
  return "image/png";
}

export function extensionForMime(mimeType) {
  if (mimeType.includes("webp")) return "webp";
  if (mimeType.includes("jpeg")) return "jpg";
  return "png";
}

export function sanitizePathPart(value) {
  return String(value).replace(/[^a-z0-9._-]+/gi, "-").replace(/^-+|-+$/g, "") || "asset";
}

function requireServiceRoleKey(value) {
  if (!value) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is required for catalog import.");
  }
  return value;
}
