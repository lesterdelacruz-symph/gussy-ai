import { describe, expect, it } from "vitest";
import {
  buildCatalogRow,
  decodeFirestoreValue,
  displayPriceForProduct,
  productFromDocument,
  shouldImport
} from "./import-gussy-products.mjs";

describe("Firestore catalog import mapping", () => {
  it("decodes Firestore REST values into a product object", () => {
    const product = productFromDocument({
      name: "projects/project-gussy/databases/(default)/documents/products/product-1",
      createTime: "2026-05-01T00:00:00Z",
      updateTime: "2026-05-02T00:00:00Z",
      fields: {
        name: { stringValue: "Alba Floor Lamp" },
        active: { booleanValue: true },
        status: { stringValue: "ACTIVE" },
        price: { integerValue: "11495" },
        tags: {
          arrayValue: {
            values: [{ stringValue: "lighting" }, { stringValue: "floor lamp" }]
          }
        }
      }
    });

    expect(product).toMatchObject({
      id: "product-1",
      name: "Alba Floor Lamp",
      active: true,
      status: "ACTIVE",
      price: 11495,
      tags: ["lighting", "floor lamp"]
    });
  });

  it("imports only active ACTIVE products and chooses client-facing prices", () => {
    expect(shouldImport({ active: true, status: "ACTIVE" })).toBe(true);
    expect(shouldImport({ active: false, status: "ACTIVE" })).toBe(false);
    expect(shouldImport({ active: true, status: "DRAFT" })).toBe(false);

    expect(displayPriceForProduct({ price: 10000, salePrice: 8000, isOnSale: true })).toBe(8000);
    expect(displayPriceForProduct({ price: 10000, salePrice: 8000, saleDiscount: 20 })).toBe(8000);
    expect(displayPriceForProduct({ price: 10000, salePrice: 8000, isOnSale: false })).toBe(10000);
  });

  it("builds catalog rows without supplier-cost or commission fields", () => {
    const row = buildCatalogRow(
      {
        id: "product-2",
        name: "Client Sofa",
        sku: "SOFA-2",
        categoryId: "seating",
        supplier: "Vendor",
        dimensions: "200cm x 90cm x 80cm",
        material: "Fabric",
        colors: "Gray",
        active: true,
        status: "ACTIVE",
        price: 50000,
        salePrice: 45000,
        isOnSale: true,
        purchasePrice: 30000,
        commission: 5000,
        imgUrl: "https://example.com/sofa.png"
      },
      { storagePath: "products/product-2/product-2.png", publicUrl: "https://supabase.example/sofa.png" }
    );

    expect(row).toMatchObject({
      firebase_doc_id: "product-2",
      name: "Client Sofa",
      sku: "SOFA-2",
      display_price: 45000,
      public_url: "https://supabase.example/sofa.png",
      source_image_url: "https://example.com/sofa.png"
    });
    expect(Object.keys(row)).not.toContain("purchasePrice");
    expect(Object.keys(row)).not.toContain("commission");
  });

  it("decodes nested maps used by Firestore REST", () => {
    expect(
      decodeFirestoreValue({
        mapValue: {
          fields: {
            width: { doubleValue: 12.5 },
            meta: { mapValue: { fields: { supplier: { stringValue: "Vendor" } } } }
          }
        }
      })
    ).toEqual({ width: 12.5, meta: { supplier: "Vendor" } });
  });
});
