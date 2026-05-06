import { describe, expect, it } from "vitest";
import { firestoreDocumentToCatalogAsset } from "./firestore-catalog";

describe("Firestore catalog fallback", () => {
  it("maps active Firestore products into client-facing catalog assets", () => {
    const asset = firestoreDocumentToCatalogAsset({
      name: "projects/project-gussy/databases/(default)/documents/products/product-1",
      fields: {
        name: { stringValue: "Alba Floor Lamp - Black" },
        sku: { stringValue: "9035F_BLACK" },
        supplier: { stringValue: "Shadows and Patterns" },
        active: { booleanValue: true },
        status: { stringValue: "ACTIVE" },
        price: { integerValue: "11495" },
        salePrice: { integerValue: "9995" },
        isOnSale: { booleanValue: true },
        imgUrl: { stringValue: "https://firebasestorage.googleapis.com/v0/b/project-gussy.appspot.com/o/item.png?alt=media" },
        material: { stringValue: "Metal" }
      }
    });

    expect(asset).toMatchObject({
      id: "catalog:product-1",
      name: "Alba Floor Lamp - Black",
      category: "lighting",
      catalog: true,
      sku: "9035F_BLACK",
      supplier: "Shadows and Patterns",
      retailPrice: 11495,
      salePrice: 9995,
      displayPrice: 9995,
      material: "Metal"
    });
  });

  it("ignores inactive products and products without images", () => {
    expect(
      firestoreDocumentToCatalogAsset({
        name: "projects/project-gussy/databases/(default)/documents/products/product-2",
        fields: {
          name: { stringValue: "Draft Sofa" },
          active: { booleanValue: false },
          status: { stringValue: "ACTIVE" },
          imgUrl: { stringValue: "https://example.com/sofa.png" }
        }
      })
    ).toBeNull();

    expect(
      firestoreDocumentToCatalogAsset({
        name: "projects/project-gussy/databases/(default)/documents/products/product-3",
        fields: {
          name: { stringValue: "No Image Table" },
          active: { booleanValue: true },
          status: { stringValue: "ACTIVE" }
        }
      })
    ).toBeNull();
  });
});
