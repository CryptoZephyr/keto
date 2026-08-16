import { describe, expect, it } from "vitest";
import { loadNamed } from "./dynamic";

describe("dynamic", () => {
  it("exports a loader", () => {
    expect(typeof loadNamed).toBe("function");
  });
});
