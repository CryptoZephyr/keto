import { describe, expect, it } from "vitest";
import { isolated } from "./isolated";

describe("isolated", () => {
  it("does not depend on other fixture modules", () => {
    expect(isolated()).toBe("isolated");
  });
});
