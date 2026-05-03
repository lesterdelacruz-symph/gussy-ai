import type { CanvasItem, FurnitureAsset } from "./types";

const CATEGORY_SIZE_BOXES: Record<string, { width: number; height: number }> = {
  rugs: { width: 320, height: 190 },
  seating: { width: 280, height: 190 },
  tables: { width: 190, height: 130 },
  lighting: { width: 140, height: 230 },
  storage: { width: 240, height: 210 },
  decor: { width: 180, height: 160 }
};

export function defaultItemSize(asset: FurnitureAsset) {
  return fitAssetToBox(asset, CATEGORY_SIZE_BOXES[asset.category] ?? CATEGORY_SIZE_BOXES.decor);
}

export function createCanvasItem(asset: FurnitureAsset, input: { x: number; y: number; zIndex: number }): CanvasItem {
  const size = defaultItemSize(asset);
  return {
    id: createId(),
    assetId: asset.id,
    x: input.x,
    y: input.y,
    width: size.width,
    height: size.height,
    rotation: 0,
    scaleX: 1,
    scaleY: 1,
    zIndex: input.zIndex
  };
}

export function normalizeZIndex(items: CanvasItem[]) {
  return items
    .slice()
    .sort((a, b) => a.zIndex - b.zIndex)
    .map((item, index) => ({ ...item, zIndex: index }));
}

function createId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return "10000000-1000-4000-8000-100000000000".replace(/[018]/g, (char) =>
    (Number(char) ^ (Math.random() * 16) >> (Number(char) / 4)).toString(16)
  );
}

export function fitAssetToBox(asset: FurnitureAsset, box: { width: number; height: number }) {
  if (!asset.naturalWidth || !asset.naturalHeight) {
    return { width: box.width, height: box.height };
  }

  const scale = Math.min(box.width / asset.naturalWidth, box.height / asset.naturalHeight);
  return {
    width: Math.max(1, Math.round(asset.naturalWidth * scale)),
    height: Math.max(1, Math.round(asset.naturalHeight * scale))
  };
}
