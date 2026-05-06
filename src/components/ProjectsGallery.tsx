"use client";

import type { Session, SupabaseClient } from "@supabase/supabase-js";
import { ArrowLeft, Loader2, LogOut, PanelRight, Plus, Trash2 } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { listDesignerCatalogAssets } from "@/lib/catalog-loader";
import { getFurnitureAssetFromList } from "@/lib/furniture-assets";
import {
  createRemoteProject,
  deleteRemoteProject,
  ensureProfile,
  listRemoteProjects,
  loadRemoteProject,
  saveLastActiveProjectId
} from "@/lib/supabase-project-store";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser";
import type { CanvasItem, CanvasState, FurnitureAsset, MoodboardProject } from "@/lib/types";
import { listUploadedAssets } from "@/lib/uploaded-assets";

export function ProjectsGallery() {
  const router = useRouter();
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);
  const [session, setSession] = useState<Session | null>(null);
  const [authReady, setAuthReady] = useState(!supabase);
  const [projects, setProjects] = useState<MoodboardProject[]>([]);
  const [uploadedAssets, setUploadedAssets] = useState<FurnitureAsset[]>([]);
  const [catalogAssets, setCatalogAssets] = useState<FurnitureAsset[]>([]);
  const [status, setStatus] = useState("Loading projects...");
  const [creating, setCreating] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function loadProjects(client: SupabaseClient, activeSession: Session) {
    try {
      await ensureProfile(client, activeSession.user.id, activeSession.user.email ?? null);
      const summaries = await listRemoteProjects(client);
      const fullProjects = (
        await Promise.all(summaries.map((summary) => loadRemoteProject(client, summary.id)))
      ).filter((project): project is MoodboardProject => Boolean(project));
      const [uploads, catalog] = await Promise.all([listUploadedAssets(client), listDesignerCatalogAssets(client)]);
      setUploadedAssets(uploads);
      setCatalogAssets(catalog);
      setProjects(fullProjects);
      setStatus(fullProjects.length === 0 ? "No projects yet." : "Projects loaded.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Failed to load projects.");
    }
  }

  useEffect(() => {
    if (!supabase) return;

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
    if (!supabase || !session?.user) return;
    const loadTimer = window.setTimeout(() => {
      void loadProjects(supabase, session);
    }, 0);
    return () => window.clearTimeout(loadTimer);
  }, [supabase, session?.user.id]); // eslint-disable-line react-hooks/exhaustive-deps

  async function createProject() {
    if (!supabase || !session?.user || creating) return;
    setCreating(true);
    try {
      const project = await createRemoteProject(supabase, session.user.id, `Moodboard ${projects.length + 1}`);
      router.push(`/?project=${project.id}`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Failed to create project.");
      setCreating(false);
    }
  }

  async function openProject(projectId: string) {
    if (supabase && session?.user) {
      await saveLastActiveProjectId(supabase, session.user.id, projectId);
    }
    router.push(`/?project=${projectId}`);
  }

  async function signOut() {
    if (!supabase) return;
    await supabase.auth.signOut();
    setProjects([]);
    setUploadedAssets([]);
    setCatalogAssets([]);
    router.push("/");
  }

  async function deleteProject(project: MoodboardProject) {
    if (!supabase || !session?.user || deletingId) return;
    if (!window.confirm(`Delete "${project.name}"? This removes its saved canvas and generated media records.`)) return;

    setDeletingId(project.id);
    try {
      await deleteRemoteProject(supabase, project.id);
      const nextProjects = projects.filter((item) => item.id !== project.id);
      setProjects(nextProjects);
      if (nextProjects[0]) {
        await saveLastActiveProjectId(supabase, session.user.id, nextProjects[0].id);
      } else {
        await saveLastActiveProjectId(supabase, session.user.id, null);
      }
      setStatus(nextProjects.length === 0 ? "No projects yet." : "Project deleted.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Failed to delete project.");
    } finally {
      setDeletingId(null);
    }
  }

  if (!supabase) {
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

  if (!authReady) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[var(--background)]">
        <Loader2 className="h-5 w-5 animate-spin text-[var(--accent)]" />
      </main>
    );
  }

  if (!session) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[var(--background)] px-4">
        <div className="w-full max-w-sm rounded-md border border-[var(--line)] bg-[var(--surface)] p-5 text-center">
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--ink-muted)]">Projects</p>
          <h1 className="mt-1 text-xl font-semibold">Sign in to view drafts</h1>
          <Link
            href="/"
            className="mt-5 inline-flex h-9 items-center justify-center rounded-md bg-[var(--accent)] px-4 text-xs font-semibold text-white"
          >
            Go to login
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      <header className="flex h-14 items-center justify-between border-b border-[var(--line)] bg-[var(--surface)] px-4">
        <div className="flex min-w-0 items-center gap-3">
          <Link
            href="/"
            className="flex h-8 w-8 items-center justify-center rounded-md bg-[var(--accent)] text-white"
            aria-label="Back to canvas"
          >
            <PanelRight size={16} />
          </Link>
          <div className="min-w-0">
            <p className="text-base font-semibold">Projects</p>
            <p className="text-[11px] font-medium text-[var(--ink-muted)]">{projects.length} drafts</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/"
            className="hidden h-9 items-center gap-1.5 rounded-md border border-[var(--line)] bg-white px-3 text-xs font-semibold text-[var(--ink-muted)] hover:border-[var(--accent)] hover:text-[var(--accent)] sm:flex"
          >
            <ArrowLeft size={13} />
            Canvas
          </Link>
          <button
            onClick={() => void createProject()}
            disabled={creating}
            className="flex h-9 items-center gap-1.5 rounded-md bg-[var(--accent)] px-3 text-xs font-semibold text-white hover:bg-[var(--accent-strong)] disabled:opacity-50"
          >
            {creating ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />}
            New project
          </button>
          <button
            onClick={() => void signOut()}
            className="flex h-9 items-center justify-center rounded-md border border-[var(--line)] bg-white px-2.5 text-[var(--ink-muted)] hover:border-[var(--accent)] hover:text-[var(--accent)]"
            aria-label="Sign out"
            title={session.user.email ?? "Sign out"}
          >
            <LogOut size={14} />
          </button>
        </div>
      </header>

      <section className="mx-auto max-w-7xl px-4 py-5">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {projects.map((project) => (
            <article
              key={project.id}
              className="group overflow-hidden rounded-md border border-[var(--line)] bg-[var(--surface)] transition hover:-translate-y-0.5 hover:border-[var(--accent)]"
            >
              <button onClick={() => void openProject(project.id)} className="block w-full text-left">
                <ProjectCanvasPreview canvas={project.canvas} assets={[...uploadedAssets, ...catalogAssets]} />
              </button>
              <div className="flex items-center justify-between gap-3 border-t border-[var(--line)] px-3 py-2">
                <button onClick={() => void openProject(project.id)} className="min-w-0 text-left">
                  <p className="truncate text-sm font-semibold">{project.name}</p>
                  <p className="mt-0.5 text-[11px] font-medium text-[var(--ink-muted)]">
                    {project.canvas.items.length} items · Updated {formatDate(project.updatedAt)}
                  </p>
                </button>
                <div className="flex shrink-0 items-center gap-1.5">
                  <button
                    onClick={() => void openProject(project.id)}
                    className="rounded bg-[var(--surface-subtle)] px-2 py-1 text-[10px] font-semibold text-[var(--ink-muted)] hover:text-[var(--accent)]"
                  >
                    Open
                  </button>
                  <button
                    onClick={() => void deleteProject(project)}
                    disabled={deletingId === project.id}
                    className="flex h-7 w-7 items-center justify-center rounded-md border border-[var(--line)] text-[var(--ink-muted)] hover:border-[var(--clay)] hover:text-[var(--clay)] disabled:opacity-50"
                    aria-label={`Delete ${project.name}`}
                  >
                    {deletingId === project.id ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>

        {projects.length === 0 ? (
          <div className="flex min-h-[420px] items-center justify-center rounded-md border border-dashed border-[var(--line)] bg-[var(--surface)]">
            <div className="text-center">
              <p className="text-base font-semibold">No projects yet</p>
              <p className="mt-1 text-sm text-[var(--ink-muted)]">{status}</p>
              <button
                onClick={() => void createProject()}
                disabled={creating}
                className="mt-4 inline-flex h-9 items-center gap-1.5 rounded-md bg-[var(--accent)] px-3 text-xs font-semibold text-white disabled:opacity-50"
              >
                {creating ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />}
                Create first project
              </button>
            </div>
          </div>
        ) : null}
      </section>
    </main>
  );
}

function ProjectCanvasPreview({ canvas, assets }: { canvas: CanvasState; assets: FurnitureAsset[] }) {
  return (
    <div
      className="relative aspect-[14/9] overflow-hidden bg-[var(--surface-subtle)]"
      style={{ backgroundColor: canvas.background }}
    >
      {canvas.items.length === 0 ? (
        <div className="absolute inset-0 flex items-center justify-center text-xs font-semibold text-[var(--ink-muted)]">
          Empty canvas
        </div>
      ) : null}
      {canvas.items
        .slice()
        .sort((a, b) => a.zIndex - b.zIndex)
        .map((item) => (
          <PreviewItem key={item.id} item={item} canvas={canvas} assets={assets} />
        ))}
    </div>
  );
}

function PreviewItem({ item, canvas, assets }: { item: CanvasItem; canvas: CanvasState; assets: FurnitureAsset[] }) {
  const asset = getFurnitureAssetFromList(item.assetId, assets);
  if (!asset) return null;

  return (
    <Image
      src={asset.src}
      alt={asset.name}
      width={asset.naturalWidth ?? 1408}
      height={asset.naturalHeight ?? 768}
      sizes="320px"
      className="absolute object-contain"
      style={{
        left: `${(item.x / canvas.width) * 100}%`,
        top: `${(item.y / canvas.height) * 100}%`,
        width: `${(item.width / canvas.width) * 100}%`,
        height: `${(item.height / canvas.height) * 100}%`,
        transform: `rotate(${item.rotation}deg) scale(${item.scaleX}, ${item.scaleY})`,
        transformOrigin: "center"
      }}
    />
  );
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric"
  }).format(new Date(value));
}
