import type { SupabaseClient } from "@supabase/supabase-js";
import type { CanvasItem, GeneratedRender, MoodboardProject, ProjectSummary, VideoJob } from "./types";

export type MediaKind = "render_image" | "video_clip" | "walkthrough_video" | "presentation_pdf";
export type MediaStatus = "pending" | "processing" | "succeeded" | "failed";

export interface SupabaseProjectRow {
  id: string;
  owner_id: string;
  name: string;
  canvas_width: number;
  canvas_height: number;
  canvas_background: string;
  status: "draft" | "archived";
  budget_amount: number | string | null;
  budget_currency: string;
  created_at: string;
  updated_at: string;
  canvas_items?: SupabaseCanvasItemRow[];
  generated_media?: SupabaseGeneratedMediaRow[];
}

export interface SupabaseCanvasItemRow {
  id: string;
  project_id: string;
  asset_id: string;
  x: number | string;
  y: number | string;
  width: number | string;
  height: number | string;
  rotation: number | string;
  scale_x: number | string;
  scale_y: number | string;
  z_index: number;
}

export interface SupabaseGeneratedMediaRow {
  id: string;
  kind: MediaKind;
  status: MediaStatus;
  public_url: string;
  mime_type: string | null;
  prompt: string | null;
  model: string | null;
  variation_index: number | null;
  created_at: string;
  error: string | null;
  metadata?: Record<string, unknown> | null;
}

export interface SupabaseProfileRow {
  id: string;
  display_name: string | null;
  last_active_project_id: string | null;
}

const PROJECT_SELECT = `
  id,
  owner_id,
  name,
  canvas_width,
  canvas_height,
  canvas_background,
  status,
  budget_amount,
  budget_currency,
  created_at,
  updated_at,
  canvas_items (
    id,
    project_id,
    asset_id,
    x,
    y,
    width,
    height,
    rotation,
    scale_x,
    scale_y,
    z_index
  ),
  generated_media (
    id,
    kind,
    status,
    public_url,
    mime_type,
    prompt,
    model,
    variation_index,
    metadata,
    created_at,
    error
  )
`;

export function projectToSupabaseRows(project: MoodboardProject, userId: string) {
  return {
    projectRow: {
      id: project.id,
      owner_id: userId,
      name: project.name,
      canvas_width: project.canvas.width,
      canvas_height: project.canvas.height,
      canvas_background: project.canvas.background,
      status: "draft" as const,
      budget_amount: project.budgetAmount,
      budget_currency: project.budgetCurrency,
      created_at: project.createdAt,
      updated_at: project.updatedAt
    },
    canvasRows: project.canvas.items.map((item) => canvasItemToRow(item, project.id))
  };
}

export function diffCanvasRowsForSave(project: MoodboardProject, previousProject?: MoodboardProject | null) {
  const currentRows = project.canvas.items.map((item) => canvasItemToRow(item, project.id));
  if (!previousProject) {
    return { upsertRows: currentRows, deleteIds: [] };
  }

  const previousRows = new Map(
    previousProject.canvas.items.map((item) => {
      const row = canvasItemToRow(item, previousProject.id);
      return [row.id, row];
    })
  );
  const currentIds = new Set(currentRows.map((row) => row.id));

  return {
    upsertRows: currentRows.filter((row) => {
      const previousRow = previousRows.get(row.id);
      return !previousRow || !canvasRowsMatch(row, previousRow);
    }),
    deleteIds: [...previousRows.keys()].filter((id) => !currentIds.has(id))
  };
}

export function projectFromSupabaseRows(row: SupabaseProjectRow): MoodboardProject {
  const media = row.generated_media ?? [];
  const videoState = mediaToVideoState(media);

  return {
    id: row.id,
    name: row.name,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    budgetAmount: row.budget_amount === null || row.budget_amount === undefined ? null : Number(row.budget_amount),
    budgetCurrency: row.budget_currency ?? "PHP",
    canvas: {
      width: row.canvas_width,
      height: row.canvas_height,
      background: row.canvas_background,
      items: (row.canvas_items ?? [])
        .slice()
        .sort((a, b) => a.z_index - b.z_index)
        .map(canvasItemFromRow)
    },
    renders: mediaToGeneratedRenders(media),
    videoJobs: videoState.videoJobs,
    stitchedVideoUrl: videoState.stitchedVideoUrl,
    presentationUrl: mediaToPresentationUrl(media)
  };
}

export function projectSummaryFromRow(row: {
  id: string;
  name: string;
  created_at: string;
  updated_at: string;
  canvas_items?: Array<{ id: string }>;
}): ProjectSummary {
  return {
    id: row.id,
    name: row.name,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    itemCount: row.canvas_items?.length ?? 0
  };
}

export function mediaToGeneratedRenders(media: SupabaseGeneratedMediaRow[]): GeneratedRender[] {
  return media
    .filter((item) => item.kind === "render_image" && item.status === "succeeded")
    .sort((a, b) => {
      const variationCompare = (a.variation_index ?? 0) - (b.variation_index ?? 0);
      return variationCompare || a.created_at.localeCompare(b.created_at);
    })
    .map((item) => ({
      id: item.id,
      url: item.public_url,
      mimeType: item.mime_type ?? "image/png",
      prompt: item.prompt ?? "",
      selected: true,
      createdAt: item.created_at,
      status: "succeeded",
      angleLabel: typeof item.metadata?.angleLabel === "string" ? item.metadata.angleLabel : undefined
    }));
}

export function mediaToVideoState(media: SupabaseGeneratedMediaRow[]): {
  videoJobs: VideoJob[];
  stitchedVideoUrl: string | null;
} {
  const videoJobs = media
    .filter((item) => item.kind === "video_clip")
    .sort((a, b) => a.created_at.localeCompare(b.created_at))
    .map((item) => ({
      id: item.id,
      status: item.status,
      videoUrl: item.public_url,
      error: item.error ?? undefined
    }));

  const stitchedVideo =
    media
      .filter((item) => item.kind === "walkthrough_video" && item.status === "succeeded")
      .sort((a, b) => b.created_at.localeCompare(a.created_at))[0]?.public_url ?? null;

  return { videoJobs, stitchedVideoUrl: stitchedVideo };
}

export function mediaToPresentationUrl(media: SupabaseGeneratedMediaRow[]) {
  return (
    media
      .filter((item) => item.kind === "presentation_pdf" && item.status === "succeeded")
      .sort((a, b) => b.created_at.localeCompare(a.created_at))[0]?.public_url ?? null
  );
}

export function storagePathForMedia(
  userId: string,
  projectId: string,
  folder: "renders" | "videos" | "presentations",
  mediaId: string,
  mimeType: string
) {
  const extension = mimeType.includes("pdf")
    ? "pdf"
    : mimeType.includes("png")
      ? "png"
      : mimeType.includes("webp")
        ? "webp"
        : mimeType.includes("mp4")
          ? "mp4"
          : "jpg";
  return `${userId}/${projectId}/${folder}/${mediaId}.${extension}`;
}

export function normalizeProjectForSupabase(project: MoodboardProject): MoodboardProject {
  return {
    ...project,
    id: toUuid(project.id),
    canvas: {
      ...project.canvas,
      items: project.canvas.items.map((item) => ({
        ...item,
        id: toUuid(item.id)
      }))
    }
  };
}

export async function ensureProfile(client: SupabaseClient, userId: string, displayName?: string | null) {
  const { error } = await client
    .from("profiles")
    .upsert({ id: userId, display_name: displayName ?? null }, { onConflict: "id", ignoreDuplicates: true });
  throwIfError(error);
}

export async function loadProfile(client: SupabaseClient): Promise<SupabaseProfileRow | null> {
  const { data, error } = await client.from("profiles").select("id, display_name, last_active_project_id").maybeSingle();
  throwIfError(error);
  return data as SupabaseProfileRow | null;
}

export async function saveLastActiveProjectId(client: SupabaseClient, userId: string, projectId: string | null) {
  const { error } = await client.from("profiles").update({ last_active_project_id: projectId }).eq("id", userId);
  throwIfError(error);
}

export async function listRemoteProjects(client: SupabaseClient): Promise<ProjectSummary[]> {
  const { data, error } = await client
    .from("projects")
    .select("id, name, created_at, updated_at, canvas_items(id)")
    .eq("status", "draft")
    .order("updated_at", { ascending: false });
  throwIfError(error);
  return ((data ?? []) as Array<Parameters<typeof projectSummaryFromRow>[0]>).map(projectSummaryFromRow);
}

export async function loadRemoteProject(client: SupabaseClient, projectId: string): Promise<MoodboardProject | null> {
  const { data, error } = await client.from("projects").select(PROJECT_SELECT).eq("id", projectId).maybeSingle();
  throwIfError(error);
  return data ? projectFromSupabaseRows(data as SupabaseProjectRow) : null;
}

export async function loadInitialRemoteProject(client: SupabaseClient): Promise<MoodboardProject | null> {
  const profile = await loadProfile(client);
  if (profile?.last_active_project_id) {
    const activeProject = await loadRemoteProject(client, profile.last_active_project_id);
    if (activeProject) return activeProject;
  }

  const summaries = await listRemoteProjects(client);
  return summaries[0] ? loadRemoteProject(client, summaries[0].id) : null;
}

export async function createRemoteProject(client: SupabaseClient, userId: string, name = "Living Room Moodboard") {
  const now = new Date().toISOString();
  const project: MoodboardProject = {
    id: createUuid(),
    name,
    createdAt: now,
    updatedAt: now,
    budgetAmount: null,
    budgetCurrency: "PHP",
    canvas: {
      width: 1400,
      height: 900,
      background: "#fff7f4",
      items: []
    },
    renders: [],
    videoJobs: [],
    stitchedVideoUrl: null,
    presentationUrl: null
  };
  await saveRemoteProjectSnapshot(client, userId, project);
  await saveLastActiveProjectId(client, userId, project.id);
  return project;
}

export async function saveRemoteProjectSnapshot(
  client: SupabaseClient,
  userId: string,
  project: MoodboardProject,
  previousProject?: MoodboardProject | null
) {
  const normalizedProject = normalizeProjectForSupabase(project);
  const normalizedPreviousProject = previousProject ? normalizeProjectForSupabase(previousProject) : null;
  const { projectRow } = projectToSupabaseRows(normalizedProject, userId);
  const { upsertRows, deleteIds } = diffCanvasRowsForSave(normalizedProject, normalizedPreviousProject);

  const { error: projectError } = await client.from("projects").upsert(projectRow);
  throwIfError(projectError);

  if (deleteIds.length > 0) {
    const { error: deleteError } = await client.from("canvas_items").delete().eq("project_id", normalizedProject.id).in("id", deleteIds);
    throwIfError(deleteError);
  }

  if (upsertRows.length > 0) {
    const { error: insertError } = await client.from("canvas_items").upsert(upsertRows);
    throwIfError(insertError);
  }

  return normalizedProject;
}

export async function deleteRemoteProject(client: SupabaseClient, projectId: string) {
  const { error } = await client.from("projects").delete().eq("id", projectId);
  throwIfError(error);
}

function canvasItemToRow(item: CanvasItem, projectId: string): SupabaseCanvasItemRow {
  return {
    id: item.id,
    project_id: projectId,
    asset_id: item.assetId,
    x: item.x,
    y: item.y,
    width: item.width,
    height: item.height,
    rotation: item.rotation,
    scale_x: item.scaleX,
    scale_y: item.scaleY,
    z_index: item.zIndex
  };
}

function canvasItemFromRow(row: SupabaseCanvasItemRow): CanvasItem {
  return {
    id: row.id,
    assetId: row.asset_id,
    x: Number(row.x),
    y: Number(row.y),
    width: Number(row.width),
    height: Number(row.height),
    rotation: Number(row.rotation),
    scaleX: Number(row.scale_x),
    scaleY: Number(row.scale_y),
    zIndex: row.z_index
  };
}

function canvasRowsMatch(left: SupabaseCanvasItemRow, right: SupabaseCanvasItemRow) {
  return (
    left.project_id === right.project_id &&
    left.asset_id === right.asset_id &&
    Number(left.x) === Number(right.x) &&
    Number(left.y) === Number(right.y) &&
    Number(left.width) === Number(right.width) &&
    Number(left.height) === Number(right.height) &&
    Number(left.rotation) === Number(right.rotation) &&
    Number(left.scale_x) === Number(right.scale_x) &&
    Number(left.scale_y) === Number(right.scale_y) &&
    left.z_index === right.z_index
  );
}

function throwIfError(error: { message?: string } | null) {
  if (error) {
    throw new Error(error.message ?? "Supabase request failed");
  }
}

function toUuid(value: string) {
  return isUuid(value) ? value : createUuid();
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function createUuid() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return "10000000-1000-4000-8000-100000000000".replace(/[018]/g, (char) =>
    (Number(char) ^ (Math.random() * 16) >> (Number(char) / 4)).toString(16)
  );
}
