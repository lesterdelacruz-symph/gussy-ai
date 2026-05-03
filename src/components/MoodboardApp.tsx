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
import { createCanvasItem, normalizeZIndex } from "@/lib/canvas-utils";
import { getCarouselIndex } from "@/lib/carousel";
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

type BusyState = "idle" | "rendering" | "video" | "stitching";
type AuthMode = "sign-in" | "sign-up";
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
  const allAssets = useMemo(() => [...uploadedAssets, ...furnitureAssets], [uploadedAssets]);

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

      currentProjectRef.current = project;
      lastRemoteProjectRef.current = project;
      setCurrentProject(project);
      setProjects(await listRemoteProjects(client));
      setUploadedAssets(await listUploadedAssets(client));
      await saveLastActiveProjectId(client, activeSession.user.id, project.id);
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
      lastRemoteProjectRef.current = project;
      persistProject(project, { saveRemote: false });
      await saveLastActiveProjectId(supabase, session.user.id, project.id);
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
      .map((item) => getFurnitureAssetFromList(item.assetId, uploadedAssets))
      .filter(Boolean);

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

      setStatus("Generated render versions. All versions are selected for walkthrough video.");
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
      setStatus("Select at least one generated render for the walkthrough.");
      return;
    }

    setBusy("video");
    setStatus("Starting walkthrough video jobs...");

    try {
      const response = await fetch("/api/generate-video", {
        method: "POST",
        headers,
        body: JSON.stringify({
          projectId: currentProject.id,
          images: selectedRenders.map((render) => ({
            id: render.id,
            url: render.url,
            base64: render.base64,
            mimeType: render.mimeType
          })),
          prompt:
            "Photo-realistic interior design showroom walkthrough. Keep the room minimal with plain warm walls, grounded furniture, consistent lighting, and restrained photographer-style camera movement."
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

  async function pollVideoJobs(jobs: VideoJob[]) {
    let nextJobs = jobs;
    while (nextJobs.some((job) => job.status === "pending" || job.status === "processing")) {
      await new Promise((resolve) => setTimeout(resolve, 5000));
      const statuses = await Promise.all(
        nextJobs.map(async (job) => {
          const response = await fetch(`/api/video-status/${job.id}`);
          if (!response.ok) return job;
          return (await response.json()) as VideoJob;
        })
      );
      nextJobs = statuses;
      updateCurrentProject((project) => ({ ...project, videoJobs: statuses }));
      const completed = statuses.filter((job) => job.status === "succeeded").length;
      setStatus(`Generating walkthrough clips... ${completed}/${statuses.length} complete`);
    }

    if (nextJobs.some((job) => job.status === "failed")) {
      setStatus("At least one walkthrough clip failed. Check the video job cards.");
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
              const asset = getFurnitureAssetFromList(assetId, uploadedAssets);
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
              onOpenPreview={() => setPreviewIndex(0)}
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
  onOpenPreview,
  onToggleRender
}: {
  project: MoodboardProject;
  onOpenPreview: () => void;
  onToggleRender: (renderId: string) => void;
}) {
  return (
    <div className="asset-scrollbar min-h-0 flex-1 overflow-y-auto p-3">
      <div className="border-b border-[var(--line)] pb-3">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold text-[var(--foreground)]">Generated photos</p>
          <p className="flex h-5 min-w-5 items-center justify-center rounded-full bg-[var(--surface-subtle)] px-1.5 text-[10px] font-semibold text-[var(--ink-muted)]">
          {project.renders.filter((render) => render.status !== "pending").length}
          </p>
        </div>
        <div className="mt-1.5">
          {project.renders.length === 0 ? (
            <p className="text-[11px] font-medium leading-4 text-[var(--ink-muted)]">Your generations will appear here.</p>
          ) : (
            <div className="grid grid-cols-4 gap-1">
              {project.renders.map((render, index) => (
                render.status === "pending" ? (
                  <div
                    key={render.id}
                    className="relative aspect-square overflow-hidden rounded-md border border-[var(--line)] bg-[var(--surface-subtle)]"
                    title={`Generating version ${index + 1}`}
                  >
                    <div className="absolute inset-0 animate-pulse bg-gradient-to-r from-transparent via-white/55 to-transparent" />
                    <span className="absolute left-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-sm bg-white/70 px-1 text-[9px] font-semibold text-[var(--ink-muted)]">
                      {index + 1}
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
                    className={`group relative aspect-square overflow-hidden rounded-md border bg-white text-left transition ${
                      render.selected ? "border-[var(--accent)] ring-1 ring-[var(--accent)]/25" : "border-[var(--line)]"
                    }`}
                  >
                    <Image
                      src={render.url}
                      alt={`Generated render ${index + 1}`}
                      fill
                      sizes="64px"
                      className="object-cover transition group-hover:scale-[1.03]"
                    />
                    <span className="absolute left-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-sm bg-black/60 px-1 text-[9px] font-semibold text-white">
                      {index + 1}
                    </span>
                    {render.selected ? (
                      <span className="absolute bottom-1 right-1 h-2 w-2 rounded-full bg-[var(--accent)] ring-1 ring-white" />
                    ) : null}
                  </button>
                )
              ))}
            </div>
          )}
        </div>
      <button
        onClick={onOpenPreview}
        disabled={!project.renders.some((render) => render.status !== "pending")}
          className="mt-3 flex h-8 w-full items-center justify-center gap-1.5 rounded-md border border-dashed border-[var(--line)] text-[11px] font-semibold text-[var(--ink-muted)] transition enabled:hover:border-[var(--accent)] enabled:hover:text-[var(--accent)] disabled:opacity-55"
        >
          <Eye size={13} />
          Preview
        </button>
      </div>

      <div className="mt-3">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold text-[var(--foreground)]">Video jobs</p>
          <p className="flex h-5 min-w-5 items-center justify-center rounded-full bg-[var(--surface-subtle)] px-1.5 text-[10px] font-semibold text-[var(--ink-muted)]">
            {project.videoJobs.length}
          </p>
        </div>
        <div className="mt-1.5 space-y-1.5">
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
      </div>
    </div>
  );
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
          <p className="text-sm font-semibold">Version {index + 1} of {renders.length}</p>
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
