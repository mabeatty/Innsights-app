import { describe, it, expect } from "vitest";
import { formatProjectOption, projectOptions } from "./projectLabel";

describe("formatProjectOption", () => {
  it("shows the city and its brand", () => {
    expect(formatProjectOption({ name: "Ashland", brands: { name: "Home2 Suites" } })).toBe("Ashland — Home2 Suites");
  });
  it("shows both brands for a dual-brand project", () => {
    expect(formatProjectOption({ name: "Tudor Arms", brands: { name: "Hampton Inn" }, secondary_brand: { name: "Tapestry" } })).toBe("Tudor Arms — Hampton Inn / Tapestry");
  });
  it("is just the name when there's no brand", () => {
    expect(formatProjectOption({ name: "Ferry Street" })).toBe("Ferry Street");
    expect(formatProjectOption({ name: "Ferry Street", brands: null, secondary_brand: null })).toBe("Ferry Street");
  });
  it("doesn't repeat a brand the name already contains (case-insensitive)", () => {
    expect(formatProjectOption({ name: "Springfield Home2 Suites", brands: { name: "Home2 Suites" } })).toBe("Springfield Home2 Suites");
    expect(formatProjectOption({ name: "Springfield home2 suites", brands: { name: "Home2 Suites" } })).toBe("Springfield home2 suites");
  });
  it("still shows the other brand when only one is already in the name", () => {
    expect(formatProjectOption({ name: "Tudor Arms Hampton Inn", brands: { name: "Hampton Inn" }, secondary_brand: { name: "Tapestry" } })).toBe("Tudor Arms Hampton Inn — Tapestry");
  });
});

describe("projectOptions", () => {
  it("keeps same-city projects together, ordered by label, and doesn't mutate its input", () => {
    const input = [
      { id: "3", name: "Ontario", brands: { name: "Home2 Suites" } },
      { id: "1", name: "Ashland", brands: { name: "Home2 Suites" } },
      { id: "2", name: "Ontario", brands: { name: "Hampton Inn" } },
    ];
    const copy = JSON.parse(JSON.stringify(input));
    expect(projectOptions(input)).toEqual([
      { id: "1", label: "Ashland — Home2 Suites" },
      { id: "2", label: "Ontario — Hampton Inn" },
      { id: "3", label: "Ontario — Home2 Suites" },
    ]);
    expect(input).toEqual(copy);
  });
});
