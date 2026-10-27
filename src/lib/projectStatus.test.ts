import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "fs";
import { PROJECT_STATUSES } from "./projectStatus";

// PROJECT_STATUSES must match project_info_project_status_check in the database (see the
// comment in projectStatus.ts) — a status the code offers but the database rejects fails
// at save time. This compares the code with the latest migration that defines the rule.
describe("PROJECT_STATUSES", () => {
  it("matches the allowed values in the latest migration for project_info_project_status_check", () => {
    const dir = "supabase/migrations";
    const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
    const defining = files.filter((f) => /add constraint project_info_project_status_check/i.test(readFileSync(`${dir}/${f}`, "utf8")));
    expect(defining.length).toBeGreaterThan(0);
    const sql = readFileSync(`${dir}/${defining[defining.length - 1]}`, "utf8");
    const list = sql.match(/array\[([^\]]+)\]/i)![1];
    const allowed = [...list.matchAll(/'([^']+)'/g)].map((m) => m[1]);
    expect([...allowed].sort()).toEqual([...PROJECT_STATUSES].sort());
  });

  it("includes Completed", () => {
    expect(PROJECT_STATUSES).toContain("Completed");
  });
});
