import type { CanvasItem, FurnitureAsset, MoodboardProject, ProjectSummary } from "./types";
import { fitAssetToBox } from "./canvas-utils";
import { getFurnitureAsset } from "./furniture-assets";

export const PROJECTS_KEY = "gussy:projects";
export const ACTIVE_PROJECT_KEY = "gussy:activeProjectId";

const DEFAULT_CANVAS = {
  width: 1400,
  height: 900,
  background: "#fff7f4"
};

interface CreateProjectInput {
  id?: string;
  name?: string;
  now?: string;
}

export function projectKey(id: string) {
  return `gussy:project:${id}`;
}

export function createProject(input: CreateProjectInput = {}): MoodboardProject {
  const now = input.now ?? new Date().toISOString();
  const id = input.id ?? createId();

  return {
    id,
    name: input.name?.trim() || "Untitled Project",
    createdAt: now,
    updatedAt: now,
    budgetAmount: null,
    budgetCurrency: "PHP",
    canvas: {
      ...DEFAULT_CANVAS,
      items: []
    },
    renders: [],
    videoJobs: [],
    stitchedVideoUrl: null,
    presentationUrl: null
  };
}

export function generateStarterLayout(_assets: FurnitureAsset[]): CanvasItem[] {
  const picks = [
    pickAsset(_assets, "rugs"),
    pickAsset(_assets, "seating"),
    pickAsset(_assets, "tables"),
    pickAsset(_assets, "lighting")
  ].filter(Boolean) as FurnitureAsset[];

  const templates = [
    { x: 300, y: 420, width: 360, height: 210, rotation: 0 },
    { x: 430, y: 285, width: 330, height: 210, rotation: 0 },
    { x: 500, y: 490, width: 180, height: 120, rotation: 0 },
    { x: 760, y: 250, width: 130, height: 260, rotation: 0 }
  ];

  return picks.map((asset, index) => {
    const template = templates[index];
    const size = fitAssetToBox(asset, template);
    return {
      id: createId(),
      assetId: asset.id,
      x: template.x,
      y: template.y,
      width: size.width,
      height: size.height,
      rotation: template.rotation,
      scaleX: 1,
      scaleY: 1,
      zIndex: index
    };
  });
}

export function loadProjects(storage: Storage): ProjectSummary[] {
  return readJson<ProjectSummary[]>(storage, PROJECTS_KEY, []);
}

export function saveProject(storage: Storage, project: MoodboardProject) {
  storage.setItem(projectKey(project.id), JSON.stringify(project));

  const summary: ProjectSummary = {
    id: project.id,
    name: project.name,
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
    itemCount: project.canvas.items.length
  };
  const summaries = loadProjects(storage);
  const next = [summary, ...summaries.filter((item) => item.id !== project.id)].sort((a, b) =>
    b.updatedAt.localeCompare(a.updatedAt)
  );
  storage.setItem(PROJECTS_KEY, JSON.stringify(next));
}

export function loadProject(storage: Storage, id: string): MoodboardProject | null {
  const project = readJson<MoodboardProject | null>(storage, projectKey(id), null);
  if (!project) return null;
  return repairProjectAspectRatios({
    ...project,
    budgetAmount: project.budgetAmount ?? null,
    budgetCurrency: project.budgetCurrency ?? "PHP",
    presentationUrl: project.presentationUrl ?? null
  });
}

export function saveActiveProjectId(storage: Storage, id: string) {
  storage.setItem(ACTIVE_PROJECT_KEY, id);
}

export function loadActiveProjectId(storage: Storage): string | null {
  return storage.getItem(ACTIVE_PROJECT_KEY);
}

export function deleteProject(storage: Storage, id: string) {
  storage.removeItem(projectKey(id));
  const next = loadProjects(storage).filter((item) => item.id !== id);
  storage.setItem(PROJECTS_KEY, JSON.stringify(next));
  if (loadActiveProjectId(storage) === id) {
    storage.removeItem(ACTIVE_PROJECT_KEY);
  }
}

function pickAsset(assets: FurnitureAsset[], category: string) {
  return assets.find((asset) => asset.category === category) ?? assets[0];
}

function repairProjectAspectRatios(project: MoodboardProject): MoodboardProject {
  return {
    ...project,
    canvas: {
      ...project.canvas,
      items: project.canvas.items.map((item) => {
        const asset = getFurnitureAsset(item.assetId);
        if (!asset?.naturalWidth || !asset.naturalHeight) return item;
        const size = fitAssetToBox(asset, item);
        if (size.width === item.width && size.height === item.height) return item;
        return { ...item, ...size };
      })
    }
  };
}

function readJson<T>(storage: Storage, key: string, fallback: T): T {
  const raw = storage.getItem(key);
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function createId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `project-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}
