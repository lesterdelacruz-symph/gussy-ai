import { describe, expect, it } from "vitest";
import { appendGeneratedRender, beginRenderGeneration } from "./render-state";
import type { GeneratedRender, MoodboardProject } from "./types";

const baseProject: MoodboardProject = {
  id: "project-1",
  name: "Living Room",
  createdAt: "2026-04-29T00:00:00.000Z",
  updatedAt: "2026-04-29T00:00:00.000Z",
  budgetAmount: null,
  budgetCurrency: "PHP",
  canvas: {
    width: 1400,
    height: 900,
    background: "#fff7f4",
    items: []
  },
  renders: [
    {
      id: "old-render",
      url: "/generated/old.jpg",
      base64: "old",
      mimeType: "image/jpeg",
      prompt: "{}",
      selected: true,
      createdAt: "2026-04-29T00:00:00.000Z"
    }
  ],
  videoJobs: [{ id: "job-1", status: "succeeded", videoUrl: "/videos/job-1.mp4" }],
  stitchedVideoUrl: "/videos/final.mp4",
  presentationUrl: null
};

function render(id: string): GeneratedRender {
  return {
    id,
    url: `/generated/${id}.jpg`,
    base64: id,
    mimeType: "image/jpeg",
    prompt: "{}",
    selected: false,
    createdAt: "2026-04-29T01:00:00.000Z"
  };
}

describe("render state", () => {
  it("clears previous renders and video output when a new render generation starts", () => {
    const nextProject = beginRenderGeneration(baseProject);
    expect(nextProject).toMatchObject({
      videoJobs: [],
      stitchedVideoUrl: null
    });
    expect(nextProject.renders).toHaveLength(4);
    expect(nextProject.renders.every((item) => item.status === "pending")).toBe(true);
  });

  it("appends generated renders progressively and selects each one for walkthrough generation", () => {
    const first = appendGeneratedRender(beginRenderGeneration(baseProject), render("render-1"));
    const second = appendGeneratedRender(first, render("render-2"));

    expect(second.renders.map((item) => ({ id: item.id, selected: item.selected, status: item.status }))).toEqual([
      { id: "render-1", selected: true, status: "succeeded" },
      { id: "render-2", selected: true, status: "succeeded" },
      { id: "pending-render-3", selected: false, status: "pending" },
      { id: "pending-render-4", selected: false, status: "pending" }
    ]);
    expect(
      second.renders
        .filter((item) => item.status !== "pending")
        .map((item) => ({ id: item.id, selected: item.selected }))
    ).toEqual([
      { id: "render-1", selected: true },
      { id: "render-2", selected: true }
    ]);
    expect(second.renders.filter((item) => item.status !== "pending").every((item) => item.base64 === undefined)).toBe(true);
  });
});
