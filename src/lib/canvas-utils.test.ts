import { describe, expect, it } from "vitest";
import { createCanvasItem, defaultItemSize, repairCanvasItemAspectRatio } from "./canvas-utils";

describe("canvas sizing", () => {
  it("fits source assets inside category boxes without changing their natural aspect ratio", () => {
    const wideAsset = {
      id: "decor_03_picture_frames_nobg",
      name: "Picture Frames",
      category: "decor",
      src: "/furniture/decor_03_picture_frames_nobg.png",
      naturalWidth: 1408,
      naturalHeight: 768
    };
    const tallAsset = {
      id: "lighting_01_floor_lamp_nobg",
      name: "Floor Lamp",
      category: "lighting",
      src: "/furniture/lighting_01_floor_lamp_nobg.png",
      naturalWidth: 512,
      naturalHeight: 1193
    };

    expect(defaultItemSize(wideAsset)).toEqual({ width: 180, height: 98 });
    expect(defaultItemSize(tallAsset)).toEqual({ width: 99, height: 230 });

    const item = createCanvasItem(wideAsset, { x: 10, y: 20, zIndex: 0 });
    expect(item.width / item.height).toBeCloseTo(1408 / 768, 2);
  });

  it("repairs a distorted canvas item while keeping its center position", () => {
    const asset = {
      id: "catalog:side-table",
      name: "Side Table",
      category: "tables",
      src: "https://example.com/side-table.webp",
      naturalWidth: 650,
      naturalHeight: 686
    };

    const repaired = repairCanvasItemAspectRatio(
      { id: "item-1", assetId: asset.id, x: 100, y: 200, width: 320, height: 120, rotation: 0, scaleX: 1, scaleY: 1, zIndex: 0 },
      asset
    );

    expect(repaired.width / repaired.height).toBeCloseTo(650 / 686, 2);
    expect(repaired.x + repaired.width / 2).toBeCloseTo(260, 0);
    expect(repaired.y + repaired.height / 2).toBeCloseTo(260, 0);
  });
});
