import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  getProjectName,
  getProjectCustomDomain,
  runWithCfProjectOverride,
  cfOverrideFromWorkspaceSettings,
} from "../cloudflare-pages";

describe("per-workspace CF project override", () => {
  const envBackup: Record<string, string | undefined> = {};
  beforeEach(() => {
    for (const k of ["CF_PAGES_PROJECT_SV", "CF_PAGES_DOMAIN_SV"]) envBackup[k] = process.env[k];
    process.env.CF_PAGES_PROJECT_SV = "halsobladet-blog";
    process.env.CF_PAGES_DOMAIN_SV = "halsobladet.com";
  });
  afterEach(() => {
    for (const [k, v] of Object.entries(envBackup)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  });

  it("falls back to env outside any override scope", () => {
    expect(getProjectName("sv")).toBe("halsobladet-blog");
    expect(getProjectCustomDomain("sv")).toBe("halsobladet.com");
  });

  it("resolves the workspace project inside the scope and env outside it", async () => {
    const override = cfOverrideFromWorkspaceSettings({
      cf_pages_project_by_language: { sv: "expertpanelen" },
      cf_pages_domain_by_language: { sv: "expertpanelen.se" },
    });
    expect(override).not.toBeNull();

    const inside = await runWithCfProjectOverride(override, async () => {
      await Promise.resolve(); // survives an await boundary
      return [getProjectName("sv"), getProjectCustomDomain("sv")];
    });
    expect(inside).toEqual(["expertpanelen", "expertpanelen.se"]);
    expect(getProjectName("sv")).toBe("halsobladet-blog");
  });

  it("does not leak between two concurrent scopes", async () => {
    const a = cfOverrideFromWorkspaceSettings({ cf_pages_project_by_language: { sv: "a-proj" } });
    const b = cfOverrideFromWorkspaceSettings({ cf_pages_project_by_language: { sv: "b-proj" } });
    const [ra, rb] = await Promise.all([
      runWithCfProjectOverride(a, async () => { await new Promise((r) => setTimeout(r, 5)); return getProjectName("sv"); }),
      runWithCfProjectOverride(b, async () => { await new Promise((r) => setTimeout(r, 1)); return getProjectName("sv"); }),
    ]);
    expect(ra).toBe("a-proj");
    expect(rb).toBe("b-proj");
  });

  it("returns null for workspaces without a mapping so env stays authoritative", () => {
    expect(cfOverrideFromWorkspaceSettings({})).toBeNull();
    expect(cfOverrideFromWorkspaceSettings({ cf_pages_project_by_language: { sv: "  " } })).toBeNull();
    expect(cfOverrideFromWorkspaceSettings(null)).toBeNull();
  });

  it("only overrides the languages it names", async () => {
    process.env.CF_PAGES_PROJECT_DA = "smarthelse";
    const override = cfOverrideFromWorkspaceSettings({ cf_pages_project_by_language: { sv: "expertpanelen" } });
    const da = await runWithCfProjectOverride(override, async () => getProjectName("da"));
    expect(da).toBe("smarthelse");
  });
});
