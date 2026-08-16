import { describe, expect, it } from "vitest";
import { greet } from "./user";

describe("user", () => {
  it("greets with a token", () => {
    expect(greet("ada")).toContain("ada");
  });
});
