import { describe, expect, it } from "vitest";
import {
  createProject,
  generateStarterLayout,
  loadActiveProjectId,
  loadProject,
  loadProjects,
  saveActiveProjectId,
  saveProject
} from "./project-store";
import type { FurnitureAsset } from "./types";

class MemoryStorage implements Storage {
  private values = new Map<string, string>();

  get length() {
    return this.values.size;
  }

  clear() {
    this.values.clear();
  }

  getItem(key: string) {
    return this.values.get(key) ?? null;
  }

  key(index: number) {
    return Array.from(this.values.keys())[index] ?? null;
  }

  removeItem(key: string) {
    this.values.delete(key);
  }

  setItem(key: string, value: string) {
    this.values.set(key, value);
  }
}

const assets: FurnitureAsset[] = [
  {
    id: "seating_01_sofa_nobg",
    name: "Sofa",
    category: "seating",
    src: "/furniture/seating_01_sofa_nobg.png"
  },
  {
    id: "tables_02_coffee_nobg",
    name: "Coffee Table",
    category: "tables",
    src: "/furniture/tables_02_coffee_nobg.png"
  },
  {
    id: "rugs_02_geometric_nobg",
    name: "Geometric Rug",
    category: "rugs",
    src: "/furniture/rugs_02_geometric_nobg.png"
  },
  {
    id: "lighting_01_floor_lamp_nobg",
    name: "Floor Lamp",
    category: "lighting",
    src: "/furniture/lighting_01_floor_lamp_nobg.png"
  }
];

describe("project store", () => {
  it("persists project summaries, active project id, and full project state", () => {
    const storage = new MemoryStorage();
    const project = createProject({
      id: "project-1",
      name: "Client Living Room",
      now: "2026-04-29T06:00:00.000Z"
    });

    project.canvas.items = generateStarterLayout(assets);
    saveProject(storage, project);
    saveActiveProjectId(storage, project.id);

    expect(loadProjects(storage)).toEqual([
      {
        id: "project-1",
        name: "Client Living Room",
        createdAt: "2026-04-29T06:00:00.000Z",
        updatedAt: "2026-04-29T06:00:00.000Z",
        itemCount: 4
      }
    ]);
    expect(loadActiveProjectId(storage)).toBe("project-1");
    expect(loadProject(storage, "project-1")?.canvas.items).toHaveLength(4);
  });

  it("repairs distorted persisted item dimensions when loading a project", () => {
    const storage = new MemoryStorage();
    const project = createProject({
      id: "project-1",
      name: "Client Living Room",
      now: "2026-04-29T06:00:00.000Z"
    });
    project.canvas.items = [
      {
        id: "item-1",
        assetId: "decor_03_picture_frames_nobg",
        x: 40,
        y: 50,
        width: 160,
        height: 160,
        rotation: 0,
        scaleX: 1,
        scaleY: 1,
        zIndex: 0
      }
    ];
    saveProject(storage, project);

    expect(loadProject(storage, "project-1")?.canvas.items[0]).toMatchObject({
      width: 160,
      height: 87
    });
  });

  it("creates four editable starter placements with stable z-order and coordinates", () => {
    const layout = generateStarterLayout(assets);

    expect(layout).toHaveLength(4);
    expect(layout.map((item) => item.assetId)).toEqual([
      "rugs_02_geometric_nobg",
      "seating_01_sofa_nobg",
      "tables_02_coffee_nobg",
      "lighting_01_floor_lamp_nobg"
    ]);
    expect(layout.map((item) => item.zIndex)).toEqual([0, 1, 2, 3]);
    expect(layout[0]).toMatchObject({
      x: 300,
      y: 420,
      width: 360,
      height: 210,
      rotation: 0,
      scaleX: 1,
      scaleY: 1
    });
  });

  it("preserves source aspect ratios in generated starter placements when dimensions are known", () => {
    const layout = generateStarterLayout(
      assets.map((asset) => ({
        ...asset,
        naturalWidth: 1408,
        naturalHeight: 768
      }))
    );

    expect(layout.map((item) => ({ width: item.width, height: item.height }))).toEqual([
      { width: 360, height: 196 },
      { width: 330, height: 180 },
      { width: 180, height: 98 },
      { width: 130, height: 71 }
    ]);
  });
});
