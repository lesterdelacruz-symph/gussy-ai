import { describe, expect, it } from "vitest";
import { getCarouselIndex } from "./carousel";

describe("carousel", () => {
  it("wraps preview navigation in both directions", () => {
    expect(getCarouselIndex(0, -1, 4)).toBe(3);
    expect(getCarouselIndex(3, 1, 4)).toBe(0);
    expect(getCarouselIndex(1, 1, 4)).toBe(2);
  });

  it("keeps the preview index stable when there are no images", () => {
    expect(getCarouselIndex(2, 1, 0)).toBe(2);
  });
});
