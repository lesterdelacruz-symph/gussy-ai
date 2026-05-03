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
      clipCount: 4,
      basePrompt: "Warm showroom walkthrough."
    });
    const payload = parseStructuredPayload(prompt);

    expect(prompt).toMatch(/^INTERIOR WALKTHROUGH VIDEO BRIEF/);
    expect(prompt).toContain("Warm showroom walkthrough.");
    expect(payload.task).toBe("generate_interior_walkthrough_clip");
    expect(payload.clip).toMatchObject({
      index: 1,
      count: 4,
      shot: "front_anchor_dolly",
      durationSeconds: 8
    });
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

  it("gives the second clip a noticeably closer front sofa push-in", () => {
    const payload = parseStructuredPayload(
      buildWalkthroughVideoPrompt({
        clipIndex: 2,
        clipCount: 4
      })
    );

    expect(payload.clip.shot).toBe("front_sofa_push_in");
    expect(payload.cameraDirection.movement).toContain("push in more noticeably toward the sofa");
    expect(payload.cameraDirection.movement).toContain("25-35% closer");
  });

  it("keeps later clips in the same front-oriented family for stitching continuity", () => {
    const third = parseStructuredPayload(buildWalkthroughVideoPrompt({ clipIndex: 3, clipCount: 4 }));
    const fourth = parseStructuredPayload(buildWalkthroughVideoPrompt({ clipIndex: 4, clipCount: 4 }));

    expect(third.cameraDirection.movement).toContain("similar front orientation");
    expect(fourth.cameraDirection.movement).toContain("similar front orientation");
    expect(third.cameraDirection.continuity).toContain("consistent with the other clips");
    expect(fourth.cameraDirection.continuity).toContain("consistent with the other clips");
  });
});
