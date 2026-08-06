import { describe, it, expect } from "vitest";
import { cn } from "../../lib/utils";

describe("cn utility", () => {
  it("merges class names", () => {
    expect(cn("foo", "bar")).toBe("foo bar");
  });

  it("deduplicates conflicting Tailwind classes", () => {
    expect(cn("p-4", "p-8")).toBe("p-8");
  });

  it("handles conditional classes", () => {
    // Conditions come from variables, not literals: `false && "hidden"` is
    // folded away before cn ever sees it, so the old version of this test only
    // proved a falsy argument is dropped and never exercised the true branch.
    const isHidden = [false, true][0];
    const isBold = [false, true][1];

    expect(cn("base", isHidden && "hidden", "extra")).toBe("base extra");
    expect(cn("base", isBold && "font-bold")).toBe("base font-bold");
  });
});
