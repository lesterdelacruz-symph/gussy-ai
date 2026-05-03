import { describe, expect, it } from "vitest";
import { generatedImageFileName, generatedImageUrl, safeProjectId } from "./generated-image-files";

describe("generated image file paths", () => {
  it("sanitizes project ids and builds stable public image URLs", () => {
    expect(safeProjectId("project:abc/123")).toBe("project-abc-123");
    expect(generatedImageFileName("project:abc/123", "image-1", "image/png")).toBe("project-abc-123-image-1.png");
    expect(generatedImageUrl("project:abc/123", "image-1", "image/jpeg")).toBe("/generated/project-abc-123-image-1.jpg");
  });
});
