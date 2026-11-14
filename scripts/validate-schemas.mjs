// Checks the report JSON Schema: every example must be valid, and every deliberately
// broken copy of an example must be rejected. Exits with 1 if any expectation is wrong.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import Ajv2020 from "ajv/dist/2020.js";

const SCHEMA_DIR = "schemas";
const EXAMPLES_DIR = join(SCHEMA_DIR, "examples");
const MAX_ELEMENTS = 1000;
const GOLDEN_DIR = join("tests", "golden");

const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));

const ajv = new Ajv2020({ strict: true, allErrors: true });
const schema = readJson(join(SCHEMA_DIR, "report.schema.json"));
const validate = ajv.compile(schema);
const validateIssue = ajv.compile({ $ref: `${schema.$id}#/$defs/issue` });

let failures = 0;

function expect(label, document, shouldBeValid) {
  const isValid = validate(document);
  const isAsExpected = isValid === shouldBeValid;
  console.log(
    `${isAsExpected ? "ok  " : "FAIL"} ${shouldBeValid ? "valid  " : "invalid"} ${label}`,
  );
  if (!isAsExpected) {
    failures += 1;
    if (!isValid) {
      console.log(JSON.stringify(validate.errors, null, 2));
    }
  }
}

// 1. Every example file must be a valid report.
for (const file of readdirSync(EXAMPLES_DIR).filter((name) => name.endsWith(".json"))) {
  expect(file, readJson(join(EXAMPLES_DIR, file)), true);
}

// 2. Each case below breaks one thing in a valid report, and the schema must reject it.
const base = readJson(join(EXAMPLES_DIR, "flipped-normals.json"));
const brokenCases = {
  "missing schema_version": (d) => delete d.schema_version,
  "unsupported major version": (d) => {
    d.schema_version = "2.0";
  },
  "unknown rule id": (d) => {
    d.issues[0].rule = "normal.sideways";
  },
  "unknown severity": (d) => {
    d.issues[0].severity = "fatal";
  },
  "unsupported asset format": (d) => {
    d.asset.format = "fbx";
  },
  "asset name with a Unix path": (d) => {
    d.asset.name = "/Users/someone/crate.glb";
  },
  "asset name with a Windows path": (d) => {
    d.asset.name = "C:\\Users\\someone\\crate.glb";
  },
  "timestamp is not UTC": (d) => {
    d.generated_at = "2026-12-01T09:30:00+09:00";
  },
  "negative element index": (d) => {
    d.issues[0].elements = [-1];
  },
  "more elements than the limit": (d) => {
    d.issues[0].elements = Array.from({ length: MAX_ELEMENTS + 1 }, (_, index) => index);
  },
  "issue count is zero": (d) => {
    d.issues[0].count = 0;
  },
  "negative summary count": (d) => {
    d.summary.issues.error = -1;
  },
  "issue without a message": (d) => delete d.issues[0].message,
  "unknown top-level property": (d) => {
    d.debug = true;
  },
  "triangle issue without a target": (d) => delete d.issues[0].target,
  "asset-level issue that lists elements": (d) => {
    d.issues[0].element_kind = "asset";
  },
};

for (const [label, applyBreakage] of Object.entries(brokenCases)) {
  const document = structuredClone(base);
  applyBreakage(document);
  expect(label, document, false);
}

for (const name of readdirSync(GOLDEN_DIR)
  .filter((name) => name.endsWith(".json"))
  .sort()) {
  const issues = readJson(join(GOLDEN_DIR, name));
  if (!Array.isArray(issues)) {
    console.log(`FAIL ${name}: golden file must contain an issue array`);
    failures += 1;
    continue;
  }
  for (const [index, issue] of issues.entries()) {
    const valid = validateIssue(issue);
    console.log(`${valid ? "ok  " : "FAIL"} ${name} issue ${index} matches #/$defs/issue`);
    if (!valid) {
      failures += 1;
      console.log(JSON.stringify(validateIssue.errors, null, 2));
    }
  }
}

console.log(failures === 0 ? "\nAll schema checks passed." : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
