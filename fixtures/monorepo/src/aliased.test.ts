import { describe, expect, it } from "vitest";
import { useHelper } from "./aliased";

describe("aliased", () => {
  it("resolves the path alias", () => {
    expect(useHelper()).toBe("helper");
  });
});
