import { type IssueCounts, summarizeIssues } from "../issues/describe";
import type { Issue, LoadCounts, Thresholds } from "../wasm/lint_core.mjs";

export type ReportThresholds = Thresholds;

export interface Report {
  schema_version: "1.0";
  tool: { name: "lint-asset"; version: string };
  generated_at: string;
  asset: { name: string; format: "glb" | "gltf" | "obj"; size_bytes: number };
  thresholds: ReportThresholds;
  summary: LoadCounts & { issues: IssueCounts };
  issues: Issue[];
}

export interface ReportInput {
  fileName: string;
  format?: "glb" | "gltf";
  fileSize: number;
  toolVersion: string;
  generatedAt: Date;
  result: LoadCounts & { issues: readonly Issue[]; thresholds: ReportThresholds };
}

export const MAX_FILE_NAME_LENGTH = 255;
export const FALLBACK_FILE_NAME = "model.glb";

export function buildReport(input: ReportInput): Report {
  const { result } = input;
  return {
    schema_version: "1.0",
    tool: { name: "lint-asset", version: input.toolVersion },
    generated_at: input.generatedAt.toISOString().replace(/\.\d{3}Z$/, "Z"),
    asset: {
      name: safeFileName(input.fileName),
      format: input.format ?? "glb",
      size_bytes: input.fileSize,
    },
    thresholds: {
      max_triangles: result.thresholds.max_triangles,
      min_extent_m: result.thresholds.min_extent_m,
      max_extent_m: result.thresholds.max_extent_m,
    },
    summary: {
      meshes: result.meshes,
      primitives: result.primitives,
      triangles: result.triangles,
      issues: summarizeIssues(result.issues),
    },
    issues: result.issues.map((issue): Issue => {
      const common = {
        rule: issue.rule,
        severity: issue.severity,
        message: issue.message,
      };
      if (issue.element_kind === "triangle") {
        return {
          ...common,
          element_kind: "triangle",
          target: { mesh: issue.target.mesh, primitive: issue.target.primitive },
          count: issue.count,
          elements: [...issue.elements],
          truncated: issue.truncated,
        };
      }
      return {
        ...common,
        element_kind: "asset",
        count: issue.count,
        elements: [],
        truncated: issue.truncated,
      };
    }),
  };
}

export function safeFileName(name: string): string {
  const fileName =
    name
      .slice(Math.max(name.lastIndexOf("/"), name.lastIndexOf("\\")) + 1)
      .split("")
      .filter((character) => character.charCodeAt(0) > 31 && character.charCodeAt(0) !== 127)
      .join("")
      .trim() || FALLBACK_FILE_NAME;
  if (fileName.length <= MAX_FILE_NAME_LENGTH) return fileName;
  const dot = fileName.lastIndexOf(".");
  if (dot < 0) return fileName.slice(0, MAX_FILE_NAME_LENGTH);
  const extension = fileName.slice(dot);
  const baseLength = Math.max(0, MAX_FILE_NAME_LENGTH - extension.length);
  return fileName.slice(0, baseLength) + extension.slice(0, MAX_FILE_NAME_LENGTH);
}
