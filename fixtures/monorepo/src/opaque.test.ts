import { describe, expect, it } from "vitest";
import { loadOpaque } from "./opaque";

describe("opaque", () => {
  it("exports the missed-dependency helper", () => {
    expect(typeof loadOpaque).toBe("function");
  });
});
