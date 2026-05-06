"use client";

/* eslint-disable react-hooks/set-state-in-effect */

import type { Session, SupabaseClient } from "@supabase/supabase-js";
import {
  ChevronLeft,
  ChevronRight,
  Eye,
  ImagePlus,
  Loader2,
  PanelRight,
  FileText,
  Play,
  Sparkles,
  Wand2,
  X
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { AssetLibrary } from "@/components/AssetLibrary";
import { CanvasWorkspace, type CanvasWorkspaceRef } from "@/components/CanvasWorkspace";
import { createCanvasItem, normalizeZIndex, repairCanvasAspectRatios } from "@/lib/canvas-utils";
import { getCarouselIndex } from "@/lib/carousel";
import { listDesignerCatalogAssets } from "@/lib/catalog-loader";
import { buildFFESchedule, formatMoney, type FFEScheduleSummary } from "@/lib/ffe-schedule";
import { furnitureAssets, getFurnitureAssetFromList } from "@/lib/furniture-assets";
import { appendGeneratedRender, beginRenderGeneration } from "@/lib/render-state";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser";
import {
  createRemoteProject,
  ensureProfile,
  listRemoteProjects,
  loadInitialRemoteProject,
  loadRemoteProject,
  normalizeProjectForSupabase,
  saveLastActiveProjectId,
  saveRemoteProjectSnapshot
} from "@/lib/supabase-project-store";
import type { CanvasState, FurnitureAsset, GeneratedRender, MoodboardProject, ProjectSummary, VideoJob } from "@/lib/types";
import { listUploadedAssets } from "@/lib/uploaded-assets";

type BusyState = "idle" | "rendering" | "video" | "stitching" | "exporting";
type AuthMode = "sign-in" | "sign-up";
type RightPanelView = "photos" | "schedule" | "video";
const REMOTE_SAVE_DEBOUNCE_MS = 900;
const DEFAULT_RENDER_STYLE =
  "photo-realistic interior design showroom with plain warm walls, coherent studio lighting, natural contact shadows, and showroom-grade materials";

export function MoodboardApp({ initialProjectId }: { initialProjectId?: string | null }) {
  const canvasRef = useRef<CanvasWorkspaceRef>(null);
  const currentProjectRef = useRef<MoodboardProject | null>(null);
  const lastRemoteProjectRef = useRef<MoodboardProject | null>(null);
  const remoteSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const skipNextUndoSnapshotRef = useRef(false);
  const uploadInputRef = useRef<HTMLInputElement>(null);
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);
  const [session, setSession] = useState<Session | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [loadingWorkspace, setLoadingWorkspace] = useState(false);
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [currentProject, setCurrentProject] = useState<MoodboardProject | null>(null);
  const [uploadedAssets, setUploadedAssets] = useState<FurnitureAsset[]>([]);
  const [catalogAssets, setCatalogAssets] = useState<FurnitureAsset[]>([]);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [busy, setBusy] = useState<BusyState>("idle");
  const [, setStatus] = useState("Ready");
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);
  const [undoStack, setUndoStack] = useState<CanvasState[]>([]);
  const [authMode, setAuthMode] = useState<AuthMode>("sign-in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authStatus, setAuthStatus] = useState("");
  const [removeUploadBackground, setRemoveUploadBackground] = useState(true);
  const [uploadingAsset, setUploadingAsset] = useState(false);

  const selectedRenderCount = useMemo(
    () => currentProject?.renders.filter((render) => render.selected && render.status !== "pending").length ?? 0,
    [currentProject?.renders]
  );
  const allAssets = useMemo(() => [...uploadedAssets, ...catalogAssets, ...furnitureAssets], [catalogAssets, uploadedAssets]);
  const ffeSchedule = useMemo(
    () =>
      currentProject
        ? buildFFESchedule(currentProject.canvas, allAssets, currentProject.budgetCurrency)
        : { rows: [], total: 0, pricedItemCount: 0, currency: "PHP" },
    [allAssets, currentProject]
  );

  async function loadWorkspace(client: SupabaseClient, activeSession: Session) {
    setLoadingWorkspace(true);
    setStatus("Loading projects...");
    try {
      await ensureProfile(client, activeSession.user.id, activeSession.user.email ?? null);
      let project = initialProjectId ? await loadRemoteProject(client, initialProjectId) : null;
      project ??= await loadInitialRemoteProject(client);
      if (!project) {
        project = await createRemoteProject(client, activeSession.user.id, "Living Room Moodboard");
      }

      const [uploads, catalog] = await Promise.all([listUploadedAssets(client), listDesignerCatalogAssets(client)]);
      const workspaceAssets = [...uploads, ...catalog, ...furnitureAssets];
      const repairedProject = repairCanvasAspectRatios(project, workspaceAssets);
      currentProjectRef.current = repairedProject;
      lastRemoteProjectRef.current = repairedProject;
      setCurrentProject(repairedProject);
      setProjects(await listRemoteProjects(client));
      setUploadedAssets(uploads);
      setCatalogAssets(catalog);
      await saveLastActiveProjectId(client, activeSession.user.id, project.id);
      if (repairedProject !== project) {
        lastRemoteProjectRef.current = await saveRemoteProjectSnapshot(client, activeSession.user.id, repairedProject, project);
      }
      setStatus("Workspace synced.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Failed to load workspace.");
    } finally {
      setLoadingWorkspace(false);
    }
  }

  useEffect(() => {
    currentProjectRef.current = currentProject;
  }, [currentProject]);

  useEffect(() => {
    if (!supabase) {
      setAuthReady(true);
      return;
    }

    let cancelled = false;
    supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return;
      setSession(data.session);
      setAuthReady(true);
    });

    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
    });

    return () => {
      cancelled = true;
      data.subscription.unsubscribe();
    };
  }, [supabase]);

  useEffect(() => {
    if (!supabase || !session?.user) {
      setCurrentProject(null);
      setProjects([]);
      setUploadedAssets([]);
      setCatalogAssets([]);
      return;
    }

    void loadWorkspace(supabase, session);
  }, [initialProjectId, supabase, session?.user.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (previewIndex === null) return;
    const renderCount = currentProject?.renders.length ?? 0;
    if (renderCount === 0) {
      setPreviewIndex(null);
      return;
    }
    if (previewIndex >= renderCount) {
      setPreviewIndex(renderCount - 1);
    }
  }, [currentProject?.renders.length, previewIndex]);

  useEffect(() => {
    if (previewIndex === null) return;
    const renderCount = currentProject?.renders.length ?? 0;
    if (renderCount === 0) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setPreviewIndex(null);
      }
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        setPreviewIndex((index) => (index === null ? index : getCarouselIndex(index, -1, renderCount)));
      }
      if (event.key === "ArrowRight") {
        event.preventDefault();
        setPreviewIndex((index) => (index === null ? index : getCarouselIndex(index, 1, renderCount)));
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [currentProject?.renders.length, previewIndex]);

  function persistProject(project: MoodboardProject, options: { saveRemote?: boolean } = {}) {
    const normalizedProject = normalizeProjectForSupabase(project);
    currentProjectRef.current = normalizedProject;
    setCurrentProject(normalizedProject);
    setProjects((items) => {
      const summary: ProjectSummary = {
        id: normalizedProject.id,
        name: normalizedProject.name,
        createdAt: normalizedProject.createdAt,
        updatedAt: normalizedProject.updatedAt,
        itemCount: normalizedProject.canvas.items.length
      };
      return [summary, ...items.filter((item) => item.id !== summary.id)].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    });

    if (options.saveRemote !== false) {
      scheduleRemoteSave(normalizedProject);
    }
  }

  function scheduleRemoteSave(project: MoodboardProject) {
    if (!supabase || !session?.user) return;
    if (remoteSaveTimer.current) clearTimeout(remoteSaveTimer.current);
    const previousProject = lastRemoteProjectRef.current;
    remoteSaveTimer.current = setTimeout(() => {
      void saveRemoteProjectSnapshot(supabase, session.user.id, project, previousProject)
        .then((savedProject) => {
          lastRemoteProjectRef.current = savedProject;
          return listRemoteProjects(supabase).then(setProjects);
        })
        .catch((error) => setStatus(error instanceof Error ? error.message : "Failed to save project."));
    }, REMOTE_SAVE_DEBOUNCE_MS);
  }

  function updateCurrentProject(updater: (project: MoodboardProject) => MoodboardProject) {
    const project = currentProjectRef.current;
    if (!project) return;
    const next = updater(project);
    persistProject({ ...next, updatedAt: new Date().toISOString() });
  }

  async function switchProject(projectId: string) {
    if (!supabase || !session?.user) return;
    try {
      const project = await loadRemoteProject(supabase, projectId);
      if (!project) return;
      const repairedProject = repairCanvasAspectRatios(project, allAssets);
      lastRemoteProjectRef.current = repairedProject;
      persistProject(repairedProject, { saveRemote: false });
      await saveLastActiveProjectId(supabase, session.user.id, repairedProject.id);
      if (repairedProject !== project) {
        lastRemoteProjectRef.current = await saveRemoteProjectSnapshot(supabase, session.user.id, repairedProject, project);
      }
      setSelectedItemId(null);
      setStatus("Project loaded.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Failed to switch project.");
    }
  }

  function addAssetToCanvas(asset: FurnitureAsset, position?: { x: number; y: number }) {
    updateCurrentProject((project) => {
      const item = createCanvasItem(asset, {
        x: position?.x ?? 560 + project.canvas.items.length * 18,
        y: position?.y ?? 340 + project.canvas.items.length * 14,
        zIndex: project.canvas.items.length
      });
      if (position) {
        item.x = Math.round(Math.max(0, position.x - item.width / 2));
        item.y = Math.round(Math.max(0, Math.min(project.canvas.height - item.height, position.y - item.height / 2)));
      }
      return {
        ...project,
        canvas: {
          ...project.canvas,
          items: normalizeZIndex([...project.canvas.items, item])
        }
      };
    });
  }

  function handleCanvasChange(canvas: CanvasState) {
    const previousCanvas = currentProjectRef.current?.canvas;
    if (previousCanvas && !skipNextUndoSnapshotRef.current) {
      setUndoStack((items) => [...items.slice(-29), previousCanvas]);
    }
    skipNextUndoSnapshotRef.current = false;
    updateCurrentProject((project) => ({ ...project, canvas }));
  }

  function undoCanvasChange() {
    const previousCanvas = undoStack.at(-1);
    if (!previousCanvas) return;
    skipNextUndoSnapshotRef.current = true;
    setUndoStack((items) => items.slice(0, -1));
    handleCanvasChange(previousCanvas);
    setSelectedItemId(null);
  }

  function clearCanvas() {
    updateCurrentProject((project) => ({
      ...project,
      canvas: {
        ...project.canvas,
        items: []
      }
    }));
    setSelectedItemId(null);
    setStatus("Canvas cleared.");
  }

  async function generateRenders() {
    if (!currentProject || busy !== "idle") return;
    if (currentProject.canvas.items.length === 0) {
      setStatus("Add furniture to the canvas before generating realistic images.");
      return;
    }

    const headers = authHeaders();
    if (!headers) return;

    const canvasImage = canvasRef.current?.exportCanvas();
    if (!canvasImage) {
      setStatus("Canvas export failed. Try again after the canvas loads.");
      return;
    }

    const projectForGeneration = currentProject;
    const canvasState = currentProject.canvas;
    const selectedFurnitureAssets = canvasState.items
      .map((item) => getFurnitureAssetFromList(item.assetId, allAssets))
      .filter((asset): asset is FurnitureAsset => Boolean(asset));

    setBusy("rendering");
    setStatus("Starting realistic image generation...");
    updateCurrentProject((project) => (project.id === projectForGeneration.id ? beginRenderGeneration(project) : project));

    try {
      let anchorRender: GeneratedRender | null = null;
      for (let index = 1; index <= 4; index++) {
        setStatus(
          index === 1
            ? "Generating anchor showroom angle 1/4..."
            : `Generating angle ${index}/4 using image 1 as orientation reference...`
        );
        const response = await fetch("/api/generate-renders", {
          method: "POST",
          headers,
          body: JSON.stringify({
            projectId: projectForGeneration.id,
            canvasImage,
            canvasState,
            furnitureAssets: selectedFurnitureAssets,
            style: DEFAULT_RENDER_STYLE,
            variationIndex: index,
            variationCount: 4,
            replaceExisting: index === 1,
            orientationReference: anchorRender
              ? {
                  url: anchorRender.url,
                  mimeType: anchorRender.mimeType
                }
              : undefined
          })
        });
        const data = await response.json();
        if (!response.ok) {
          throw new Error(data.error || `Failed to generate render ${index}`);
        }
        const image = data.images?.[0] as GeneratedRender | undefined;
        if (!image) {
          throw new Error(`Render ${index} finished without image data.`);
        }

        updateCurrentProject((project) =>
          project.id === projectForGeneration.id ? appendGeneratedRender(project, image) : project
        );
        anchorRender ??= image;
        setStatus(`Generated ${index}/4 realistic image versions.`);
      }

      setStatus("Generated render versions. Select the photo you want to turn into an 8-second walkthrough.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Failed to generate renders.");
    } finally {
      setBusy("idle");
    }
  }

  async function generateWalkthrough() {
    if (!currentProject || busy !== "idle") return;
    const headers = authHeaders();
    if (!headers) return;

    const selectedRenders = currentProject.renders.filter((render) => render.selected && render.status !== "pending");
    if (selectedRenders.length === 0) {
      setStatus("Select one generated render for the walkthrough.");
      return;
    }
    const sourceRender = selectedRenders[0];

    setBusy("video");
    setStatus("Starting one 8-second walkthrough video...");

    try {
      const response = await fetch("/api/generate-video", {
        method: "POST",
        headers,
        body: JSON.stringify({
          projectId: currentProject.id,
          images: [
            {
              id: sourceRender.id,
              url: sourceRender.url,
              base64: sourceRender.base64,
              mimeType: sourceRender.mimeType
            }
          ],
          prompt:
            "Photo-realistic 8-second interior design showroom walkthrough. Use one continuous slow front showroom push with a subtle left-to-right arc around the room. Keep plain warm walls, grounded furniture, consistent lighting, and restrained photographer-style camera movement."
        })
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Failed to start video generation");
      }

      updateCurrentProject((project) => ({ ...project, videoJobs: data.jobs, stitchedVideoUrl: null }));
      await pollVideoJobs(data.jobs);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Failed to generate walkthrough.");
      setBusy("idle");
    }
  }

  function updateBudgetAmount(value: string) {
    const nextAmount = value.trim() === "" ? null : Number(value);
    if (nextAmount !== null && (!Number.isFinite(nextAmount) || nextAmount < 0)) return;
    updateCurrentProject((project) => ({ ...project, budgetAmount: nextAmount }));
  }

  async function exportPresentation() {
    if (!currentProject || busy !== "idle") return;
    const headers = authHeaders();
    if (!headers) return;
    const canvasImage = canvasRef.current?.exportCanvas();
    if (!canvasImage) {
      setStatus("Canvas export failed. Try again after the canvas loads.");
      return;
    }

    setBusy("exporting");
    setStatus("Building presentation PDF...");
    try {
      const response = await fetch("/api/export-presentation", {
        method: "POST",
        headers,
        body: JSON.stringify({
          projectId: currentProject.id,
          canvasImage,
          renders: currentProject.renders.filter((render) => render.status !== "pending" && render.selected),
          schedule: ffeSchedule,
          budget: {
            amount: currentProject.budgetAmount,
            currency: currentProject.budgetCurrency
          }
        })
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({ error: "Failed to export presentation PDF." }));
        throw new Error(data.error || "Failed to export presentation PDF.");
      }
      const blob = await response.blob();
      const fileName = fileNameFromContentDisposition(response.headers.get("content-disposition")) ?? `${currentProject.name}.pdf`;
      downloadBlob(blob, fileName);
      setStatus("Presentation PDF downloaded.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Failed to export presentation PDF.");
    } finally {
      setBusy("idle");
    }
  }

  async function pollVideoJobs(jobs: VideoJob[]) {
    let nextJobs = jobs;
    const statusHeaders = authHeaders();
    if (!statusHeaders) {
      setBusy("idle");
      return;
    }
    while (nextJobs.some((job) => job.status === "pending" || job.status === "processing")) {
      await new Promise((resolve) => setTimeout(resolve, 5000));
      const statuses = await Promise.all(
        nextJobs.map(async (job) => {
          const response = await fetch(`/api/video-status/${job.id}`, { headers: statusHeaders });
          if (!response.ok) return job;
          return (await response.json()) as VideoJob;
        })
      );
      nextJobs = statuses;
      updateCurrentProject((project) => ({ ...project, videoJobs: statuses }));
      const completed = statuses.filter((job) => job.status === "succeeded").length;
      setStatus(`Generating 8-second walkthrough... ${completed}/${statuses.length} complete`);
    }

    if (nextJobs.some((job) => job.status === "failed")) {
      setStatus("Walkthrough video failed. Check the video job card.");
      setBusy("idle");
      return;
    }

    if (nextJobs.length === 1 && nextJobs[0].videoUrl) {
      updateCurrentProject((project) => ({ ...project, stitchedVideoUrl: nextJobs[0].videoUrl ?? null, videoJobs: nextJobs }));
      setStatus("8-second walkthrough video is ready.");
      setBusy("idle");
      return;
    }

    const headers = authHeaders();
    if (!headers) {
      setBusy("idle");
      return;
    }

    setBusy("stitching");
    setStatus("Stitching final walkthrough video...");
    const response = await fetch("/api/stitch", {
      method: "POST",
      headers,
      body: JSON.stringify({ projectId: currentProject?.id, jobIds: nextJobs.map((job) => job.id) })
    });
    const data = await response.json();
    if (!response.ok) {
      setStatus(data.error || "Failed to stitch final video.");
      setBusy("idle");
      return;
    }

    updateCurrentProject((project) => ({ ...project, stitchedVideoUrl: data.url, videoJobs: nextJobs }));
    setStatus("Walkthrough video is ready.");
    setBusy("idle");
  }

  async function handleAuthSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase) return;
    setAuthStatus(authMode === "sign-in" ? "Signing in..." : "Creating account...");
    const credentials = { email, password };
    const { error } =
      authMode === "sign-in"
        ? await supabase.auth.signInWithPassword(credentials)
        : await supabase.auth.signUp(credentials);

    if (error) {
      setAuthStatus(error.message);
      return;
    }

    setAuthStatus(authMode === "sign-in" ? "Signed in." : "Account created. Check your email if confirmation is enabled.");
  }

  function authHeaders() {
    if (!session?.access_token) {
      setStatus("Sign in before generating media.");
      return null;
    }
    return {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session.access_token}`
    };
  }

  async function uploadAsset(file: File, removeBackground: boolean) {
    const headers = authHeaders();
    if (!headers) return;
    const form = new FormData();
    form.append("file", file);
    form.append("name", file.name);
    setStatus("Uploading asset...");

    const response = await fetch("/api/upload-asset", {
      method: "POST",
      headers: {
        Authorization: headers.Authorization
      },
      body: form
    });
    const data = await response.json();
    if (!response.ok) {
      const message = data.error || "Failed to upload asset.";
      setStatus(message);
      throw new Error(message);
    }
    const asset = data.asset as FurnitureAsset;
    const visibleAsset = { ...asset, backgroundProcessing: removeBackground };
    setUploadedAssets((items) => [visibleAsset, ...items.filter((item) => item.id !== asset.id)]);
    setStatus(removeBackground ? "Uploaded original. Removing background in the background..." : "Uploaded asset.");

    if (removeBackground) {
      void removeBackgroundForAsset(asset.id, headers.Authorization);
    }
  }

  async function removeBackgroundForAsset(assetId: string, authorization: string) {
    try {
      const response = await fetch("/api/remove-background", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: authorization
        },
        body: JSON.stringify({ assetId })
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Failed to remove background.");
      }
      const asset = data.asset as FurnitureAsset;
      setUploadedAssets((items) => [asset, ...items.filter((item) => item.id !== asset.id)]);
      setStatus("Background removed. Upload updated.");
    } catch (error) {
      setUploadedAssets((items) => items.map((asset) => (asset.id === assetId ? { ...asset, backgroundProcessing: false } : asset)));
      setStatus(error instanceof Error ? error.message : "Failed to remove background.");
    }
  }

  async function deleteUploadedAsset(asset: FurnitureAsset) {
    if (!asset.uploaded) return;
    const headers = authHeaders();
    if (!headers) return;
    if (!window.confirm(`Delete "${asset.name}" from uploads? This also removes it from the current canvas.`)) return;

    setStatus("Deleting upload...");
    const response = await fetch(`/api/upload-asset?assetId=${encodeURIComponent(asset.id)}`, {
      method: "DELETE",
      headers: {
        Authorization: headers.Authorization
      }
    });
    const data = await response.json();
    if (!response.ok) {
      setStatus(data.error || "Failed to delete upload.");
      return;
    }

    setUploadedAssets((items) => items.filter((item) => item.id !== asset.id));
    updateCurrentProject((project) => ({
      ...project,
      canvas: {
        ...project.canvas,
        items: project.canvas.items.filter((item) => item.assetId !== asset.id)
      }
    }));
    if (selectedItemId && currentProjectRef.current?.canvas.items.find((item) => item.id === selectedItemId)?.assetId === asset.id) {
      setSelectedItemId(null);
    }
    setStatus("Upload deleted.");
  }

  async function handleUploadInputChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || uploadingAsset) return;
    setUploadingAsset(true);
    try {
      await uploadAsset(file, removeUploadBackground);
    } finally {
      setUploadingAsset(false);
    }
  }

  if (!supabase) {
    return <SetupMissing />;
  }

  if (!authReady || loadingWorkspace) {
    return (
      <main className="flex h-screen items-center justify-center bg-[var(--background)]">
        <Loader2 className="h-5 w-5 animate-spin text-[var(--accent)]" />
      </main>
    );
  }

  if (!session) {
    return (
      <AuthPanel
        mode={authMode}
        email={email}
        password={password}
        status={authStatus}
        onModeChange={setAuthMode}
        onEmailChange={setEmail}
        onPasswordChange={setPassword}
        onSubmit={handleAuthSubmit}
      />
    );
  }

  if (!currentProject) {
    return (
      <main className="flex h-screen items-center justify-center bg-[var(--background)]">
        <Loader2 className="h-5 w-5 animate-spin text-[var(--accent)]" />
      </main>
    );
  }

  const isWorking = busy !== "idle";

  return (
    <main className="flex h-screen min-h-0 flex-col overflow-hidden bg-[var(--background)]">
      <header className="flex flex-col items-stretch justify-between gap-2 border-b border-[var(--line)] bg-[var(--surface)] px-3 py-2 sm:flex-row sm:items-center lg:px-4">
        <div className="flex min-w-0 items-center gap-3">
          <Link href="/projects" className="flex h-8 w-8 items-center justify-center rounded-md bg-[var(--accent)] text-white">
            <PanelRight size={16} />
          </Link>
          <select
            value={currentProject.id}
            onChange={(event) => void switchProject(event.target.value)}
            className="h-9 min-w-0 max-w-[260px] rounded-md border border-transparent bg-transparent px-1 text-base font-semibold outline-none hover:border-[var(--line)] hover:bg-white"
          >
            {projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </select>
        </div>
        <div className="flex min-w-0 items-center justify-end gap-2">
          <label className="flex h-8 shrink-0 items-center gap-1.5 rounded-md border border-[var(--line)] bg-white px-2 text-xs font-semibold text-[var(--ink-muted)]">
            <input
              type="checkbox"
              checked={removeUploadBackground}
              onChange={(event) => setRemoveUploadBackground(event.target.checked)}
              className="h-3 w-3 accent-[var(--accent)]"
            />
            <Wand2 size={12} />
            Remove BG
          </label>
          <input ref={uploadInputRef} type="file" accept="image/*" className="hidden" onChange={handleUploadInputChange} />
          <button
            type="button"
            onClick={() => uploadInputRef.current?.click()}
            disabled={uploadingAsset || isWorking}
            className="flex h-8 shrink-0 items-center gap-1.5 rounded-md bg-[var(--accent)] px-3 text-xs font-semibold text-white transition enabled:hover:bg-[var(--accent-strong)] disabled:opacity-50"
          >
            {uploadingAsset ? <Loader2 size={13} className="animate-spin" /> : <ImagePlus size={13} />}
            Upload
          </button>
        </div>
      </header>

      <div className="grid min-h-0 min-w-0 flex-1 grid-cols-[minmax(0,1fr)_320px] items-stretch overflow-hidden">
        <div className="grid min-h-0 min-w-0 grid-rows-[minmax(0,1fr)_168px] overflow-hidden">
          <CanvasWorkspace
            ref={canvasRef}
            canvas={currentProject.canvas}
            assets={allAssets}
            selectedItemId={selectedItemId}
            onCanvasChange={handleCanvasChange}
            onSelectItem={setSelectedItemId}
            canUndo={undoStack.length > 0}
            onUndo={undoCanvasChange}
            onDropAsset={(assetId, position) => {
              const asset = getFurnitureAssetFromList(assetId, allAssets);
              if (asset) addAssetToCanvas(asset, position);
            }}
          />
          <AssetLibrary
            assets={allAssets}
            onAddAsset={addAssetToCanvas}
            onDeleteUpload={(asset) => void deleteUploadedAsset(asset)}
            onClearCanvas={clearCanvas}
            canClearCanvas={!isWorking && currentProject.canvas.items.length > 0}
          />
        </div>
        <aside className="flex h-full min-h-0 w-[320px] flex-col self-stretch border-l border-[var(--line)] bg-[var(--surface)] text-[var(--foreground)]">
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <div className="border-b border-[var(--line)] px-3 py-2">
              <div className="mb-2 flex items-center">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--ink-muted)]">Generate</p>
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                <button
                  onClick={generateRenders}
                  disabled={isWorking}
                  className="flex h-8 items-center justify-center gap-1.5 rounded-md bg-[var(--accent)] px-2 text-[11px] font-semibold text-white transition enabled:hover:bg-[var(--accent-strong)] disabled:opacity-50"
                >
                  {busy === "rendering" ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
                  Images
                </button>
                <button
                  onClick={generateWalkthrough}
                  disabled={isWorking || selectedRenderCount === 0}
                  className="flex h-8 items-center justify-center gap-1.5 rounded-md border border-[var(--line)] bg-white px-2 text-[11px] font-semibold text-[var(--foreground)] transition enabled:hover:border-[var(--accent)] enabled:hover:text-[var(--accent)] disabled:opacity-50"
                >
                  {busy === "video" || busy === "stitching" ? <Loader2 size={13} className="animate-spin" /> : <Play size={13} />}
                  Video
                </button>
              </div>
            </div>

            <RenderResults
              project={currentProject}
              schedule={ffeSchedule}
              isExporting={busy === "exporting"}
              onOpenPreview={() => setPreviewIndex(0)}
              onBudgetChange={updateBudgetAmount}
              onExportPresentation={() => void exportPresentation()}
              onToggleRender={(renderId) =>
                updateCurrentProject((project) => ({
                  ...project,
                  renders: project.renders.map((render) =>
                    render.id === renderId ? { ...render, selected: !render.selected } : render
                  )
                }))
              }
            />
          </div>
        </aside>
      </div>
      {previewIndex !== null && currentProject.renders.length > 0 ? (
        <RenderPreviewModal
          renders={currentProject.renders}
          index={previewIndex}
          onClose={() => setPreviewIndex(null)}
          onStep={(direction) =>
            setPreviewIndex((index) =>
              index === null ? index : getCarouselIndex(index, direction, currentProject.renders.length)
            )
          }
          onSelectIndex={setPreviewIndex}
        />
      ) : null}
    </main>
  );
}

function AuthPanel({
  mode,
  email,
  password,
  status,
  onModeChange,
  onEmailChange,
  onPasswordChange,
  onSubmit
}: {
  mode: AuthMode;
  email: string;
  password: string;
  status: string;
  onModeChange: (mode: AuthMode) => void;
  onEmailChange: (value: string) => void;
  onPasswordChange: (value: string) => void;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[var(--background)] px-4">
      <form onSubmit={onSubmit} className="w-full max-w-sm rounded-md border border-[var(--line)] bg-[var(--surface)] p-5">
        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--ink-muted)]">Gussy Studio</p>
        <h1 className="mt-1 text-xl font-semibold">{mode === "sign-in" ? "Designer login" : "Create account"}</h1>
        <div className="mt-5 space-y-3">
          <input
            value={email}
            onChange={(event) => onEmailChange(event.target.value)}
            type="email"
            required
            placeholder="Email"
            className="h-10 w-full rounded-md border border-[var(--line)] bg-white px-3 text-sm outline-none focus:border-[var(--accent)]"
          />
          <input
            value={password}
            onChange={(event) => onPasswordChange(event.target.value)}
            type="password"
            required
            minLength={6}
            placeholder="Password"
            className="h-10 w-full rounded-md border border-[var(--line)] bg-white px-3 text-sm outline-none focus:border-[var(--accent)]"
          />
        </div>
        <button className="mt-4 h-10 w-full rounded-md bg-[var(--accent)] px-3 text-sm font-semibold text-white">
          {mode === "sign-in" ? "Sign in" : "Sign up"}
        </button>
        <button
          type="button"
          onClick={() => onModeChange(mode === "sign-in" ? "sign-up" : "sign-in")}
          className="mt-3 w-full text-center text-xs font-semibold text-[var(--accent)]"
        >
          {mode === "sign-in" ? "Create a designer account" : "Use an existing account"}
        </button>
        <p className="mt-3 min-h-5 text-xs leading-5 text-[var(--ink-muted)]">{status}</p>
      </form>
    </main>
  );
}

function SetupMissing() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[var(--background)] px-4">
      <div className="w-full max-w-md rounded-md border border-[var(--line)] bg-[var(--surface)] p-5">
        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--ink-muted)]">Supabase setup</p>
        <h1 className="mt-1 text-xl font-semibold">Missing browser auth config</h1>
        <p className="mt-3 text-sm leading-6 text-[var(--ink-muted)]">
          Add `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` to `.env.local`, then restart the dev server.
        </p>
      </div>
    </main>
  );
}

function RenderResults({
  project,
  schedule,
  isExporting,
  onOpenPreview,
  onBudgetChange,
  onExportPresentation,
  onToggleRender
}: {
  project: MoodboardProject;
  schedule: FFEScheduleSummary;
  isExporting: boolean;
  onOpenPreview: () => void;
  onBudgetChange: (value: string) => void;
  onExportPresentation: () => void;
  onToggleRender: (renderId: string) => void;
}) {
  const budgetRemaining = project.budgetAmount === null ? null : project.budgetAmount - schedule.total;
  const [view, setView] = useState<RightPanelView>("photos");
  const budgetInputRef = useRef<HTMLInputElement>(null);
  const completedRenderCount = project.renders.filter((render) => render.status !== "pending").length;
  const scheduleItemCount = schedule.rows.reduce((sum, row) => sum + row.quantity, 0);
  const isOverBudget = budgetRemaining !== null && budgetRemaining < 0;
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden p-3">
      <div className="grid grid-cols-3 rounded-md border border-[var(--line)] bg-[var(--surface-subtle)] p-0.5">
        <PanelTab active={view === "photos"} label="Photos" count={completedRenderCount} onClick={() => setView("photos")} />
        <PanelTab active={view === "schedule"} label="Items" count={schedule.rows.length} onClick={() => setView("schedule")} />
        <PanelTab active={view === "video"} label="Video" count={project.videoJobs.length} onClick={() => setView("video")} />
      </div>

      <div className="mt-3 min-h-0 flex-1 overflow-hidden">
        {view === "photos" ? (
          <section className="asset-scrollbar h-full overflow-y-auto pr-1">
          {project.renders.length === 0 ? (
              <div className="rounded-md border border-dashed border-[var(--line)] bg-white px-3 py-8 text-center">
                <p className="text-xs font-semibold text-[var(--foreground)]">Generated photos</p>
                <p className="mt-1 text-[11px] leading-4 text-[var(--ink-muted)]">Your generations will appear here.</p>
              </div>
          ) : (
            <div className="grid grid-cols-2 gap-1.5">
              {project.renders.map((render, index) =>
                render.status === "pending" ? (
                  <div
                    key={render.id}
                    className="relative aspect-video overflow-hidden rounded-md border border-[var(--line)] bg-[var(--surface-subtle)]"
                    title={`Generating version ${index + 1}`}
                  >
                    <div className="absolute inset-0 animate-pulse bg-gradient-to-r from-transparent via-white/55 to-transparent" />
                    <span className="absolute left-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-sm bg-white/70 px-1 text-[9px] font-semibold text-[var(--ink-muted)]">
                      {index + 1}
                    </span>
                    <span className="absolute inset-x-1 bottom-4 truncate text-center text-[8px] font-semibold text-[var(--ink-muted)]">
                      {render.angleLabel}
                    </span>
                    <span className="absolute inset-x-1 bottom-1 h-1 rounded-full bg-white/70">
                      <span className="block h-full w-1/2 animate-pulse rounded-full bg-[var(--accent)]/45" />
                    </span>
                  </div>
                ) : (
                  <button
                    key={render.id}
                    onClick={() => onToggleRender(render.id)}
                    title={`Version ${index + 1}${render.selected ? " selected" : ""}`}
                    className={`group relative aspect-video overflow-hidden rounded-md border bg-white text-left transition ${
                      render.selected ? "border-[var(--accent)] ring-1 ring-[var(--accent)]/25" : "border-[var(--line)]"
                    }`}
                  >
                    <Image
                      src={render.url}
                      alt={`Generated render ${index + 1}`}
                      fill
                      sizes="180px"
                      className="object-cover transition group-hover:scale-[1.03]"
                    />
                    <span className="absolute left-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-sm bg-black/60 px-1 text-[9px] font-semibold text-white">
                      {index + 1}
                    </span>
                    <span className="absolute inset-x-1 bottom-1 truncate rounded-sm bg-black/55 px-1 py-0.5 text-center text-[8px] font-semibold text-white">
                      {render.angleLabel ?? `Version ${index + 1}`}
                    </span>
                    {render.selected ? (
                      <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-[var(--accent)] ring-1 ring-white" />
                    ) : null}
                  </button>
                )
              )}
            </div>
          )}
            <button
              onClick={onOpenPreview}
              disabled={!project.renders.some((render) => render.status !== "pending")}
              className="mt-3 flex h-8 w-full items-center justify-center gap-1.5 rounded-md border border-dashed border-[var(--line)] bg-white text-[11px] font-semibold text-[var(--ink-muted)] transition enabled:hover:border-[var(--accent)] enabled:hover:text-[var(--accent)] disabled:opacity-55"
            >
              <Eye size={13} />
              Preview
            </button>
          </section>
        ) : null}

        {view === "schedule" ? (
          <section className="flex h-full min-h-0 flex-col">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-[var(--foreground)]">Items &amp; budget</p>
              <p className="text-[10px] font-semibold text-[var(--ink-muted)]">{scheduleItemCount} items</p>
            </div>

            <div className="asset-scrollbar mt-2 min-h-0 max-h-[calc(100vh-360px)] flex-1 space-y-1.5 overflow-y-auto pr-1">
              {schedule.rows.length === 0 ? (
                <p className="rounded-md border border-dashed border-[var(--line)] bg-white px-3 py-6 text-center text-[11px] text-[var(--ink-muted)]">
                  Add furniture to see items and pricing.
                </p>
              ) : (
                schedule.rows.map((row) => (
                  <div key={row.assetId} className="rounded-md border border-[var(--line)] bg-white px-2.5 py-2 shadow-sm">
                    <div className="flex items-center justify-between gap-2">
                      <p className="min-w-0 truncate text-[11px] font-semibold leading-4 text-[var(--foreground)]">{row.name}</p>
                      {row.totalPrice === null ? (
                        <p className="shrink-0 rounded-full bg-[var(--accent)]/10 px-1.5 py-0.5 text-[9px] font-semibold text-[var(--accent)]">
                          Pricing TBD
                        </p>
                      ) : (
                        <p className="shrink-0 text-[10px] font-semibold leading-4 text-[var(--foreground)]">
                          {formatMoney(row.totalPrice, row.currency)}
                        </p>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
            <div className="sticky bottom-0 z-10 mt-auto shrink-0 space-y-2 bg-[var(--surface)] pb-1 pt-3">
              <div className="grid grid-cols-2 gap-1.5">
                <div className="flex h-16 flex-col justify-center rounded-md border border-[var(--line)] bg-white px-2.5">
                  <p className="text-[9px] font-semibold uppercase tracking-[0.12em] text-[var(--ink-muted)]">Total</p>
                  <p className="mt-1 truncate text-[13px] font-semibold leading-none text-[var(--foreground)]">
                    {formatMoney(schedule.total, schedule.currency)}
                  </p>
                </div>
                <label className="flex h-16 flex-col justify-center rounded-md border border-[var(--line)] bg-white px-2.5">
                  <span className="text-[9px] font-semibold uppercase tracking-[0.12em] text-[var(--ink-muted)]">Budget</span>
                  <input
                    ref={budgetInputRef}
                    type="number"
                    min="0"
                    inputMode="decimal"
                    value={project.budgetAmount ?? ""}
                    onChange={(event) => onBudgetChange(event.target.value)}
                    placeholder="Set target"
                    className="budget-input mt-1 block w-full bg-transparent text-[13px] font-semibold leading-none text-[var(--foreground)] outline-none placeholder:font-normal placeholder:text-[var(--ink-muted)]"
                  />
                </label>
              </div>
              {isOverBudget ? (
                <p className="text-[10px] font-semibold text-[var(--clay)]">
                  Over budget by {formatMoney(Math.abs(budgetRemaining), project.budgetCurrency)}
                </p>
              ) : null}
              <button
                onClick={onExportPresentation}
                disabled={isExporting || schedule.rows.length === 0}
                className="flex h-9 w-full items-center justify-center gap-1.5 rounded-md border border-[var(--line)] bg-white text-[11px] font-semibold text-[var(--foreground)] transition enabled:hover:border-[var(--accent)] enabled:hover:text-[var(--accent)] disabled:opacity-55"
              >
                {isExporting ? <Loader2 size={13} className="animate-spin" /> : <FileText size={13} />}
                Presentation PDF
              </button>
            </div>
          </section>
        ) : null}

        {view === "video" ? (
          <section className="asset-scrollbar h-full overflow-y-auto pr-1">
            {project.videoJobs.length === 0 && !project.stitchedVideoUrl ? (
              <p className="rounded-md border border-dashed border-[var(--line)] bg-white px-3 py-8 text-center text-[11px] text-[var(--ink-muted)]">
                Video jobs will appear here after you run Walkthrough Video.
              </p>
            ) : null}
            <div className="space-y-1.5">
              {project.videoJobs.map((job, index) => (
                <div key={job.id} className="rounded-md border border-[var(--line)] bg-white p-2">
                  <div className="flex items-center justify-between">
                    <p className="text-[11px] font-semibold text-[var(--foreground)]">Clip {index + 1}</p>
                    <p className="text-[10px] capitalize text-[var(--ink-muted)]">{job.status}</p>
                  </div>
                  {job.error ? <p className="mt-1.5 text-[10px] text-[var(--clay)]">{job.error}</p> : null}
                </div>
              ))}
              {project.stitchedVideoUrl ? (
                <div className="overflow-hidden rounded-md border border-[var(--line)] bg-white">
                  <video src={project.stitchedVideoUrl} controls className="aspect-video w-full bg-black" />
                  <a
                    href={project.stitchedVideoUrl}
                    download="gussy-walkthrough.mp4"
                    className="block px-2.5 py-2 text-[11px] font-semibold text-[var(--accent)]"
                  >
                    Download walkthrough
                  </a>
                </div>
              ) : null}
            </div>
          </section>
        ) : null}
      </div>
    </div>
  );
}

function PanelTab({
  active,
  label,
  count,
  onClick
}: {
  active: boolean;
  label: string;
  count: number;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex h-7 items-center justify-center gap-1 rounded text-[10px] font-semibold transition ${
        active ? "bg-white text-[var(--foreground)] shadow-sm" : "text-[var(--ink-muted)] hover:text-[var(--foreground)]"
      }`}
    >
      {label}
      <span className={active ? "text-[var(--accent)]" : "text-[var(--ink-muted)]"}>{count}</span>
    </button>
  );
}

function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = sanitizeDownloadFileName(fileName);
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function fileNameFromContentDisposition(header: string | null) {
  return header?.match(/filename="([^"]+)"/)?.[1] ?? null;
}

function sanitizeDownloadFileName(value: string) {
  const clean = value.replace(/[/\\?%*:|"<>]/g, "-").replace(/\s+/g, " ").trim();
  return clean.toLowerCase().endsWith(".pdf") ? clean : `${clean || "gussy-presentation"}.pdf`;
}

function RenderPreviewModal({
  renders,
  index,
  onClose,
  onStep,
  onSelectIndex
}: {
  renders: GeneratedRender[];
  index: number;
  onClose: () => void;
  onStep: (direction: -1 | 1) => void;
  onSelectIndex: (index: number) => void;
}) {
  const render = renders[index];
  if (!render) return null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[rgba(38,35,30,0.92)] text-white backdrop-blur-sm">
      <div className="flex h-14 flex-none items-center justify-between border-b border-white/10 px-4 sm:px-6">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-white/55">Preview</p>
          <p className="text-sm font-semibold">{render.angleLabel ?? `Version ${index + 1}`} · {index + 1} of {renders.length}</p>
        </div>
        <button
          onClick={onClose}
          title="Close preview"
          className="flex h-9 w-9 items-center justify-center rounded-md border border-white/15 text-white transition hover:bg-white/10"
        >
          <X size={16} />
        </button>
      </div>

      <div className="relative min-h-0 flex-1 px-3 py-4 sm:px-8 sm:py-6">
        <button
          onClick={() => onStep(-1)}
          disabled={renders.length <= 1}
          title="Previous render"
          className="absolute left-4 top-1/2 z-10 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-md border border-white/15 bg-black/25 text-white transition hover:bg-white/10 disabled:opacity-35 sm:left-6"
        >
          <ChevronLeft size={18} />
        </button>
        <div className="relative h-full w-full">
          <Image src={render.url} alt={`Generated render ${index + 1}`} fill sizes="100vw" className="object-contain" priority />
        </div>
        <button
          onClick={() => onStep(1)}
          disabled={renders.length <= 1}
          title="Next render"
          className="absolute right-4 top-1/2 z-10 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-md border border-white/15 bg-black/25 text-white transition hover:bg-white/10 disabled:opacity-35 sm:right-6"
        >
          <ChevronRight size={18} />
        </button>
      </div>

      <div className="flex h-14 flex-none items-center justify-center gap-2 border-t border-white/10 px-4">
        {renders.map((renderItem, renderIndex) => (
          <button
            key={renderItem.id}
            onClick={() => onSelectIndex(renderIndex)}
            title={`Show version ${renderIndex + 1}`}
            className={`h-2.5 rounded-full transition-all ${
              renderIndex === index ? "w-8 bg-white" : "w-2.5 bg-white/35 hover:bg-white/60"
            }`}
          />
        ))}
      </div>
    </div>
  );
}
