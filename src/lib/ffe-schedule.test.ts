import { describe, expect, it } from "vitest";
import { buildFFESchedule, formatMoney } from "./ffe-schedule";
import type { CanvasState, FurnitureAsset } from "./types";

describe("FF&E schedule", () => {
  it("groups canvas items by asset and totals client-facing prices", () => {
    const assets: FurnitureAsset[] = [
      {
        id: "catalog:chair",
        name: "Accent Chair",
        category: "seating",
        src: "https://example.com/chair.png",
        displayPrice: 12000,
        currency: "PHP",
        supplier: "Studio Vendor",
        sku: "CHAIR-1"
      }
    ];
    const canvas: CanvasState = {
      width: 1400,
      height: 900,
      background: "#fff",
      items: [
        { id: "one", assetId: "catalog:chair", x: 0, y: 0, width: 100, height: 100, rotation: 0, scaleX: 1, scaleY: 1, zIndex: 0 },
        { id: "two", assetId: "catalog:chair", x: 0, y: 0, width: 100, height: 100, rotation: 0, scaleX: 1, scaleY: 1, zIndex: 1 }
      ]
    };

    const schedule = buildFFESchedule(canvas, assets);

    expect(schedule.rows).toHaveLength(1);
    expect(schedule.rows[0]).toMatchObject({ quantity: 2, unitPrice: 12000, totalPrice: 24000 });
    expect(schedule.total).toBe(24000);
    expect(formatMoney(schedule.total, schedule.currency)).toBe("₱24,000");
  });

  it("does not expose raw upload ids as item names", () => {
    const assets: FurnitureAsset[] = [
      {
        id: "upload_41fb2eea-8f8a-4702-a8bd-912345678901",
        name: "upload_41fb2eea-8f8a-4702-a8bd-912345678901",
        category: "uploads",
        src: "https://example.com/upload.png",
        uploaded: true
      }
    ];
    const canvas: CanvasState = {
      width: 1400,
      height: 900,
      background: "#fff",
      items: [
        {
          id: "one",
          assetId: "upload_41fb2eea-8f8a-4702-a8bd-912345678901",
          x: 0,
          y: 0,
          width: 100,
          height: 100,
          rotation: 0,
          scaleX: 1,
          scaleY: 1,
          zIndex: 0
        }
      ]
    };

    expect(buildFFESchedule(canvas, assets).rows[0].name).toBe("Uploaded asset");
  });
});
