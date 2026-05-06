import type { GeneratedRender, MoodboardProject } from "./types";
import { renderAngleLabel } from "./prompt-builder";

export function beginRenderGeneration(project: MoodboardProject): MoodboardProject {
  return {
    ...project,
    renders: Array.from({ length: 4 }, (_, index) => ({
      id: `pending-render-${index + 1}`,
      url: "",
      mimeType: "image/png",
      prompt: "",
      selected: false,
      createdAt: new Date().toISOString(),
      status: "pending" as const,
      angleLabel: renderAngleLabel(index + 1)
    })),
    videoJobs: [],
    stitchedVideoUrl: null
  };
}

export function appendGeneratedRender(project: MoodboardProject, render: GeneratedRender): MoodboardProject {
  const persistableRender = { ...render };
  delete persistableRender.base64;

  return {
    ...project,
    renders: replaceNextPendingRender(project.renders, {
      ...persistableRender,
      selected: true,
      status: "succeeded"
    }),
    videoJobs: [],
    stitchedVideoUrl: null
  };
}

function replaceNextPendingRender(renders: GeneratedRender[], render: GeneratedRender) {
  const pendingIndex = renders.findIndex((item) => item.status === "pending");
  if (pendingIndex === -1) return [...renders, render];
  return renders.map((item, index) => (index === pendingIndex ? render : item));
}
