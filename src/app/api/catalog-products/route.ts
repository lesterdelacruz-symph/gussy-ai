import { NextResponse } from "next/server";
import { firestoreDocumentToCatalogAsset, type FirestoreProductsPage } from "@/lib/firestore-catalog";
import { listCatalogAssets } from "@/lib/catalog-assets";
import { getSupabaseAdminClient } from "@/lib/supabase-server";
import type { FurnitureAsset } from "@/lib/types";

export const dynamic = "force-dynamic";

const FIRESTORE_PRODUCTS_URL =
  "https://firestore.googleapis.com/v1/projects/project-gussy/databases/(default)/documents/products";
const PAGE_SIZE = 300;
const CACHE_MS = 5 * 60 * 1000;

let cachedCatalog: { expiresAt: number; assets: FurnitureAsset[] } | null = null;

export async function GET() {
  try {
    const supabaseAssets = await fetchSupabaseCatalogProducts();
    if (supabaseAssets.length > 0) {
      return NextResponse.json({ assets: supabaseAssets, source: "supabase" });
    }

    if (cachedCatalog && cachedCatalog.expiresAt > Date.now()) {
      return NextResponse.json({ assets: cachedCatalog.assets, source: "firestore-cache" });
    }

    const assets = await fetchFirestoreProducts();
    cachedCatalog = { assets, expiresAt: Date.now() + CACHE_MS };
    return NextResponse.json({ assets, source: "firestore" });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load product catalog" },
      { status: 500 }
    );
  }
}

async function fetchSupabaseCatalogProducts() {
  try {
    return await listCatalogAssets(getSupabaseAdminClient());
  } catch (error) {
    console.warn("[catalog-products] Supabase catalog unavailable; falling back to Firestore.", error);
    return [];
  }
}

async function fetchFirestoreProducts() {
  const assets: FurnitureAsset[] = [];
  let pageToken = "";

  do {
    const url = new URL(FIRESTORE_PRODUCTS_URL);
    url.searchParams.set("pageSize", String(PAGE_SIZE));
    if (pageToken) url.searchParams.set("pageToken", pageToken);

    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`Firestore catalog request failed with ${response.status}`);
    }

    const page = (await response.json()) as FirestoreProductsPage;
    if (page.error) throw new Error(page.error.message || "Firestore catalog request failed");

    for (const document of page.documents ?? []) {
      const asset = firestoreDocumentToCatalogAsset(document);
      if (asset) assets.push(asset);
    }

    pageToken = page.nextPageToken ?? "";
  } while (pageToken);

  return assets.sort((left, right) => left.name.localeCompare(right.name));
}
