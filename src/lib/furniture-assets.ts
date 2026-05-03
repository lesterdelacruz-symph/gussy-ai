import type { FurnitureAsset } from "./types";

const FURNITURE_FILES = [
  "decor_01_plant_nobg.png",
  "decor_02_mirror_nobg.png",
  "decor_03_picture_frames_nobg.png",
  "decor_04_vase_nobg.png",
  "decor_05_sculpture_nobg.png",
  "lighting_01_floor_lamp_nobg.png",
  "lighting_02_pendant_nobg.png",
  "lighting_03_chandelier_nobg.png",
  "lighting_04_table_lamp_nobg.png",
  "lighting_05_wall_sconce_nobg.png",
  "rugs_01_persian_nobg.png",
  "rugs_02_geometric_nobg.png",
  "rugs_03_round_nobg.png",
  "rugs_04_runner_nobg.png",
  "rugs_05_shaggy_nobg.png",
  "seating_01_sofa_nobg.png",
  "seating_02_armchair_nobg.png",
  "seating_03_dining_chair_nobg.png",
  "seating_04_barstool_nobg.png",
  "seating_05_loveseat_nobg.png",
  "storage_01_bookshelf_nobg.png",
  "storage_02_wardrobe_nobg.png",
  "storage_03_dresser_nobg.png",
  "storage_04_tv_stand_nobg.png",
  "storage_05_sideboard_nobg.png",
  "tables_01_dining_nobg.png",
  "tables_02_coffee_nobg.png",
  "tables_03_side_nobg.png",
  "tables_04_desk_nobg.png",
  "tables_05_console_nobg.png"
];

const SOURCE_IMAGE_SIZE = {
  naturalWidth: 1408,
  naturalHeight: 768
};

export const furnitureAssets: FurnitureAsset[] = FURNITURE_FILES.map((file) => {
  const id = file.replace(".png", "");
  const [category, , ...nameParts] = id.split("_");
  return {
    id,
    category,
    name: titleCase(nameParts.filter((part) => part !== "nobg").join(" ")),
    src: `/furniture/${file}`,
    ...SOURCE_IMAGE_SIZE
  };
});

export const furnitureCategories = Array.from(new Set(furnitureAssets.map((asset) => asset.category)));

export function getFurnitureAsset(id: string) {
  return furnitureAssets.find((asset) => asset.id === id) ?? null;
}

export function getFurnitureAssetFromList(id: string, extraAssets: FurnitureAsset[] = []) {
  return extraAssets.find((asset) => asset.id === id) ?? getFurnitureAsset(id);
}

function titleCase(value: string) {
  return value.replace(/\w\S*/g, (word) => word.charAt(0).toUpperCase() + word.slice(1));
}
