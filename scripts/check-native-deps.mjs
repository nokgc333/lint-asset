// Checks the C++ and toolchain dependencies that are pinned by hand (npm has `npm audit` and
// Dependabot; these have neither). For each one it asks GitHub for
//   - the latest release of the upstream project, to see if the pinned version is behind;
//   - the security advisories the upstream project has published.
// A dependency is a problem when it is behind, or when it has an advisory that is not listed as
// reviewed in scripts/native-deps-reviewed.json.
//
// Usage: node scripts/check-native-deps.mjs [--fail] [--root <repo dir>]
// Without --fail it only prints the report (for pull requests). With --fail it exits 1 on a
// problem (the weekly run: a failed scheduled run is what makes GitHub send a notification).
// A GITHUB_TOKEN in the environment is used when there is one (the API limit is much lower
// without it).

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const API = "https://api.github.com";

// The FetchContent_Declare blocks of a CMakeLists.txt: { name, repository, commit }.
export function parseCmakePins(text) {
  const pins = [];
  for (const part of text.split("FetchContent_Declare(").slice(1)) {
    let depth = 1;
    let end = 0;
    while (end < part.length && depth > 0) {
      if (part[end] === "(") depth += 1;
      if (part[end] === ")") depth -= 1;
      end += 1;
    }
    const block = part.slice(0, end);
    const name = block.match(/^\s*(\w+)/)?.[1];
    const repository = block.match(/GIT_REPOSITORY\s+(\S+)/)?.[1];
    const commit = block.match(/GIT_TAG\s+([0-9a-f]{40})/)?.[1];
    if (name && repository && commit) pins.push({ name, repository, commit });
  }
  return pins;
}

// "https://github.com/owner/repo.git" -> "owner/repo"
export function repositoryOf(url) {
  const match = url.match(/github\.com[/:]([^/]+\/[^/.]+)/);
  if (!match) throw new Error(`not a GitHub address: ${url}`);
  return match[1];
}

// The Emscripten version that the workflows pin, from the image name "emscripten/emsdk:7.0.0@sha256:...".
export function emsdkVersions(workflowText) {
  return [...workflowText.matchAll(/emscripten\/emsdk:([\d.]+)@sha256:/g)].map((match) => match[1]);
}

const versionOf = (tag) => tag.replace(/^v/, "");

export function compareVersions(a, b) {
  const left = versionOf(a).split(".").map(Number);
  const right = versionOf(b).split(".").map(Number);
  for (let i = 0; i < Math.max(left.length, right.length); i += 1) {
    const difference = (left[i] ?? 0) - (right[i] ?? 0);
    if (difference !== 0) return Math.sign(difference);
  }
  return 0;
}

// Decides what to say about one dependency. `facts` has what GitHub answered.
export function judge(dependency, facts, reviewed) {
  const problems = [];
  if (facts.behind) {
    problems.push(`behind: pinned ${dependency.pinned}, latest release ${facts.latest}`);
  }
  const open = facts.advisories.filter((advisory) => !reviewed.includes(advisory.id));
  for (const advisory of open) {
    problems.push(
      `advisory ${advisory.id} (${advisory.severity ?? "unknown"}): ${advisory.summary}`,
    );
  }
  return { name: dependency.name, pinned: dependency.pinned, latest: facts.latest, problems };
}

function makeFetcher(token, fetchImplementation = fetch) {
  return async (path) => {
    const response = await fetchImplementation(`${API}${path}`, {
      headers: {
        accept: "application/vnd.github+json",
        "x-github-api-version": "2022-11-28",
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
    });
    if (!response.ok) throw new Error(`GitHub answered ${response.status} for ${path}`);
    return response.json();
  };
}

// What GitHub knows about one repository, for a pinned version or commit.
export async function gatherFacts(get, repository, pin) {
  const latest = await get(`/repos/${repository}/releases/latest`);
  const advisories = await get(`/repos/${repository}/security-advisories?per_page=100`);
  let behind;
  if (pin.commit) {
    // The latest release is ahead of the pinned commit when the commit has commits after it.
    const comparison = await get(`/repos/${repository}/compare/${pin.commit}...${latest.tag_name}`);
    behind = comparison.status === "ahead" || comparison.status === "diverged";
  } else {
    behind = compareVersions(latest.tag_name, pin.version) > 0;
  }
  return {
    latest: latest.tag_name,
    behind,
    // A withdrawn advisory was found not to be a vulnerability.
    advisories: advisories
      .filter((advisory) => !advisory.withdrawn_at)
      .map((advisory) => ({
        id: advisory.ghsa_id,
        severity: advisory.severity,
        summary: advisory.summary,
      })),
  };
}

export async function check({ root, get, reviewed }) {
  const dependencies = [];
  for (const file of ["core/CMakeLists.txt", "tests/CMakeLists.txt"]) {
    for (const pin of parseCmakePins(await readFile(join(root, file), "utf8"))) {
      dependencies.push({
        name: pin.name,
        repository: repositoryOf(pin.repository),
        pinned: pin.commit.slice(0, 10),
        pin: { commit: pin.commit },
      });
    }
  }
  const versions = new Set(
    emsdkVersions(await readFile(join(root, ".github/workflows/ci.yml"), "utf8")),
  );
  for (const version of versions) {
    dependencies.push({
      name: "emscripten",
      repository: "emscripten-core/emscripten",
      pinned: version,
      pin: { version },
    });
  }
  const results = [];
  for (const dependency of dependencies) {
    const facts = await gatherFacts(get, dependency.repository, dependency.pin);
    results.push(judge(dependency, facts, reviewed));
  }
  return results;
}

async function main() {
  const args = process.argv.slice(2);
  const fail = args.includes("--fail");
  const rootIndex = args.indexOf("--root");
  const root =
    rootIndex >= 0 ? args[rootIndex + 1] : join(fileURLToPath(import.meta.url), "..", "..");
  const reviewedFile = JSON.parse(
    await readFile(join(root, "scripts/native-deps-reviewed.json"), "utf8"),
  );
  const get = makeFetcher(process.env.GITHUB_TOKEN);
  const results = await check({ root, get, reviewed: reviewedFile.advisories });
  let problems = 0;
  for (const result of results) {
    const status = result.problems.length === 0 ? "ok  " : "WARN";
    console.log(
      `${status} ${result.name}: pinned ${result.pinned}, latest release ${result.latest}`,
    );
    for (const problem of result.problems) console.log(`       ${problem}`);
    problems += result.problems.length;
  }
  if (problems > 0 && fail) process.exit(1);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
