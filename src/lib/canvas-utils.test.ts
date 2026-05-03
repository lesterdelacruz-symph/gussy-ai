import { describe, expect, it } from "vitest";
import { createCanvasItem, defaultItemSize } from "./canvas-utils";

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
});
