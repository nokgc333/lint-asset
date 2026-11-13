export function pickSingleFile(
  files: ArrayLike<File> | null | undefined,
): { kind: "file"; file: File } | { kind: "none" } | { kind: "many" } {
  if (!files || files.length === 0) return { kind: "none" };
  if (files.length > 1) return { kind: "many" };
  const file = files[0];
  return file ? { kind: "file", file } : { kind: "none" };
}
