import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  check,
  compareVersions,
  emsdkVersions,
  gatherFacts,
  judge,
  parseCmakePins,
  repositoryOf,
} from "./check-native-deps.mjs";

const COMMIT = "97789b346ed792f413b9520c80bb479f3b63368f";

describe("parseCmakePins", () => {
  it("reads every FetchContent_Declare with a repository and a commit", () => {
    const text = `
FetchContent_Declare(
  tinygltf
  GIT_REPOSITORY https://github.com/syoyo/tinygltf.git
  GIT_TAG ${COMMIT}
  PATCH_COMMAND "\${CMAKE_COMMAND}" "-DSOURCE_DIR=<SOURCE_DIR>"
    -P "x.cmake"
  SOURCE_SUBDIR lint_asset_download_only)
FetchContent_Declare(
  doctest
  GIT_REPOSITORY https://github.com/doctest/doctest.git
  GIT_TAG 1da23a3e8119ec5cce4f9388e91b065e20bf06f5)`;
    expect(parseCmakePins(text)).toEqual([
      { name: "tinygltf", repository: "https://github.com/syoyo/tinygltf.git", commit: COMMIT },
      {
        name: "doctest",
        repository: "https://github.com/doctest/doctest.git",
        commit: "1da23a3e8119ec5cce4f9388e91b065e20bf06f5",
      },
    ]);
  });

  it("skips a declaration that is not pinned to a commit", () => {
    const text = "FetchContent_Declare(x GIT_REPOSITORY https://github.com/a/b.git GIT_TAG v1.0)";
    expect(parseCmakePins(text)).toEqual([]);
  });
});

describe("small helpers", () => {
  it("names the repository from its address", () => {
    expect(repositoryOf("https://github.com/syoyo/tinygltf.git")).toBe("syoyo/tinygltf");
    expect(() => repositoryOf("https://example.invalid/a/b.git")).toThrow(/GitHub/);
  });

  it("reads the Emscripten versions from the image names", () => {
    expect(
      emsdkVersions(
        "image: emscripten/emsdk:7.0.0@sha256:abc\nimage: emscripten/emsdk:6.0.1@sha256:def",
      ),
    ).toEqual(["7.0.0", "6.0.1"]);
  });

  it("compares versions by number, not by text", () => {
    expect(compareVersions("v2.5.3", "2.4.12")).toBe(1);
    expect(compareVersions("7.0.0", "7.0.0")).toBe(0);
    expect(compareVersions("6.0.13", "7.0.0")).toBe(-1);
    expect(compareVersions("2.10.0", "2.9.9")).toBe(1);
  });
});

describe("gatherFacts and judge", () => {
  const answers =
    (overrides = {}) =>
    async (path) => {
      if (path.includes("/releases/latest")) return { tag_name: "v3.1.0" };
      if (path.includes("/security-advisories")) return overrides.advisories ?? [];
      if (path.includes("/compare/")) return { status: overrides.status ?? "identical" };
      throw new Error(`unexpected ${path}`);
    };
  const dependency = { name: "tinygltf", pinned: "97789b346e" };

  it("is fine when the pinned commit is the latest release and nothing is published", async () => {
    const facts = await gatherFacts(answers(), "syoyo/tinygltf", { commit: COMMIT });
    expect(judge(dependency, facts, []).problems).toEqual([]);
  });

  it("says a commit is behind when the latest release is ahead of it", async () => {
    for (const status of ["ahead", "diverged"]) {
      const facts = await gatherFacts(answers({ status }), "syoyo/tinygltf", { commit: COMMIT });
      expect(judge(dependency, facts, []).problems[0]).toMatch(/behind/);
    }
    const newer = await gatherFacts(answers({ status: "behind" }), "syoyo/tinygltf", {
      commit: COMMIT,
    });
    expect(judge(dependency, newer, []).problems).toEqual([]);
  });

  it("says a version is behind by comparing version numbers", async () => {
    const facts = await gatherFacts(answers(), "syoyo/tinygltf", { version: "3.0.1" });
    expect(judge(dependency, facts, []).problems[0]).toMatch(/behind/);
    const same = await gatherFacts(answers(), "syoyo/tinygltf", { version: "3.1.0" });
    expect(judge(dependency, same, []).problems).toEqual([]);
  });

  it("reports an advisory unless it is listed as reviewed, and ignores withdrawn ones", async () => {
    const advisories = [
      { ghsa_id: "GHSA-aaaa-aaaa-aaaa", severity: "high", summary: "a bug", withdrawn_at: null },
      {
        ghsa_id: "GHSA-bbbb-bbbb-bbbb",
        severity: "low",
        summary: "not one",
        withdrawn_at: "2026-01-01T00:00:00Z",
      },
    ];
    const facts = await gatherFacts(answers({ advisories }), "syoyo/tinygltf", { commit: COMMIT });
    expect(facts.advisories.map((advisory) => advisory.id)).toEqual(["GHSA-aaaa-aaaa-aaaa"]);
    expect(judge(dependency, facts, []).problems[0]).toMatch(/GHSA-aaaa-aaaa-aaaa \(high\)/);
    expect(judge(dependency, facts, ["GHSA-aaaa-aaaa-aaaa"]).problems).toEqual([]);
  });
});

describe("check", () => {
  it("reads the pins of this repository and finds nothing behind it in the stored answers", async () => {
    const root = mkdtempSync(join(tmpdir(), "deps-"));
    for (const dir of ["core", "tests", ".github/workflows"])
      mkdirSync(join(root, dir), { recursive: true });
    writeFileSync(
      join(root, "core/CMakeLists.txt"),
      `FetchContent_Declare(\n  a\n  GIT_REPOSITORY https://github.com/o/a.git\n  GIT_TAG ${COMMIT})`,
    );
    writeFileSync(join(root, "tests/CMakeLists.txt"), "");
    writeFileSync(
      join(root, ".github/workflows/ci.yml"),
      "image: emscripten/emsdk:7.0.0@sha256:abc",
    );
    const seen = [];
    const get = async (path) => {
      seen.push(path);
      if (path.includes("/releases/latest")) return { tag_name: "7.0.0" };
      if (path.includes("/security-advisories")) return [];
      return { status: "ahead" };
    };
    const results = await check({ root, get, reviewed: [] });
    expect(results.map((result) => [result.name, result.problems.length])).toEqual([
      ["a", 1],
      ["emscripten", 0],
    ]);
    expect(seen.some((path) => path.includes("emscripten-core/emscripten"))).toBe(true);
  });
});
