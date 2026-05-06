import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { catalogAssetFromRow, listCatalogAssets, type CatalogItemRow } from "./catalog-assets";

describe("catalog asset mapping", () => {
  it("maps Supabase catalog rows into draggable furniture assets with client-facing prices", () => {
    expect(
      catalogAssetFromRow({
        id: "row-1",
        firebase_doc_id: "-firebase-product",
        name: "Alba Floor Lamp",
        sku: "9035F_BLACK",
        category: "lighting",
        supplier: "Shadows and Patterns",
        dimensions: "300cm x 370cm x 155cm",
        width: "300",
        depth: "370",
        height: "155",
        material: "Marble, Iron",
        colors: "Black",
        tags: "minimalist, black",
        status: "ACTIVE",
        active: true,
        currency: "PHP",
        retail_price: "11495.00",
        sale_price: null,
        display_price: "11495.00",
        source_image_url: "https://example.com/firebase.png",
        public_url: "https://example.supabase.co/storage/v1/object/public/catalog-assets/products/item.png",
        image_width: 512,
        image_height: 1193
      })
    ).toMatchObject({
      id: "catalog:-firebase-product",
      category: "lighting",
      naturalWidth: 512,
      naturalHeight: 1193,
      catalog: true,
      sku: "9035F_BLACK",
      supplier: "Shadows and Patterns",
      displayPrice: 11495,
      src: "https://example.supabase.co/storage/v1/object/public/catalog-assets/products/item.png"
    });
  });

  it("loads catalog assets across Supabase REST pages", async () => {
    const firstPage = Array.from({ length: 1000 }, (_, index) => makeCatalogRow(`first-${index}`));
    const secondPage = [makeCatalogRow("second-0")];
    const ranges: Array<[number, number]> = [];
    const client = {
      from: () => {
        const builder = {
          select: () => builder,
          eq: () => builder,
          order: () => builder,
          range: async (from: number, to: number) => {
            ranges.push([from, to]);
            return { data: from === 0 ? firstPage : secondPage, error: null };
          }
        };
        return builder;
      }
    } as unknown as SupabaseClient;

    const assets = await listCatalogAssets(client);

    expect(assets).toHaveLength(1001);
    expect(assets.at(-1)).toMatchObject({ id: "catalog:second-0" });
    expect(ranges).toEqual([
      [0, 999],
      [1000, 1999]
    ]);
  });
});

function makeCatalogRow(firebaseDocId: string): CatalogItemRow {
  return {
    id: `row-${firebaseDocId}`,
    firebase_doc_id: firebaseDocId,
    name: `Item ${firebaseDocId}`,
    sku: null,
    category: "products",
    supplier: null,
    dimensions: null,
    width: null,
    depth: null,
    height: null,
    material: null,
    colors: null,
    tags: null,
    status: "ACTIVE",
    active: true,
    currency: "PHP",
    retail_price: null,
    sale_price: null,
    display_price: null,
    source_image_url: null,
    public_url: `https://example.supabase.co/storage/v1/object/public/catalog-assets/${firebaseDocId}.png`,
    image_width: 800,
    image_height: 600
  };
}
