import { describe, expect, it } from "vitest";
import { buildWalkthroughVideoPrompt } from "./video-prompt-builder";

function parseStructuredPayload(prompt: string) {
  const jsonStart = prompt.indexOf("{\n");
  if (jsonStart === -1) {
    throw new Error("Prompt does not contain structured JSON payload");
  }
  return JSON.parse(prompt.slice(jsonStart));
}

describe("buildWalkthroughVideoPrompt", () => {
  it("uses a structured contract that preserves the still image design", () => {
    const prompt = buildWalkthroughVideoPrompt({
      clipIndex: 1,
      clipCount: 1,
      basePrompt: "Warm showroom walkthrough."
    });
    const payload = parseStructuredPayload(prompt);

    expect(prompt).toMatch(/^INTERIOR WALKTHROUGH VIDEO BRIEF/);
    expect(prompt).toContain("Warm showroom walkthrough.");
    expect(payload.task).toBe("generate_single_8_second_interior_walkthrough");
    expect(payload.clip).toMatchObject({
      index: 1,
      count: 1,
      shot: "continuous_showroom_walkthrough",
      durationSeconds: 8
    });
    expect(payload.cameraDirection.movement).toContain("slow front showroom push");
    expect(payload.cameraDirection.movement).toContain("subtle left-to-right arc");
    expect(payload.sourceImageUse).toMatchObject({
      preserveStillImageAsCanonicalReference: true,
      cameraMayMoveButSceneMustRemainTheSameRoom: true,
      doNotRecomposeFurnitureLayout: true
    });
    expect(payload.integrityRules).toEqual(
      expect.arrayContaining([
        "Single continuous shot, no cuts.",
        "Do not replace, redesign, recolor, retexture, resize, or omit any furniture item.",
        "Plain warm interior walls only; no windows or outdoor scenery unless already visible in the source render."
      ])
    );
  });

  it("ignores extra selected images and keeps the prompt as one continuous walkthrough", () => {
    const payload = parseStructuredPayload(
      buildWalkthroughVideoPrompt({
        clipIndex: 3,
        clipCount: 4
      })
    );

    expect(payload.clip).toMatchObject({ index: 1, count: 1, durationSeconds: 8 });
    expect(payload.cameraDirection.continuity).toContain("single uninterrupted take");
  });
});
