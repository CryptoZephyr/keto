import { describe, expect, it } from "vitest";
import { fromA } from "./cycle-a";

describe("cycle", () => {
  it("loads the cycle without throwing", () => {
    expect(fromA()).toContain("A:");
  });
});
