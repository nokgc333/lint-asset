import { describe, expect, it } from "vitest";
import { describeLimitRequest } from "./limit-text";
import { DEFAULT_LIMITS, RAISED_LIMITS } from "./load-plan";

const MIB = 1024 * 1024;

describe("describeLimitRequest", () => {
  const size = {
    reason: "size",
    fileName: "big.glb",
    fileBytes: 150 * MIB,
    limits: RAISED_LIMITS,
  } as const;
  const triangles = { reason: "triangles", fileName: "dense.glb", limits: RAISED_LIMITS } as const;

  it("asks about a large file, in English as before", () => {
    expect(describeLimitRequest(size)).toBe(
      "big.glb is 150.0 MiB. Files over 100 MiB can be slow or run out of memory. Continue? Files over 200 MiB cannot be opened.",
    );
    expect(describeLimitRequest(size, "en")).toBe(describeLimitRequest(size));
  });

  it("asks about a large file, in Japanese", () => {
    expect(describeLimitRequest(size, "ja")).toBe(
      "big.glb のサイズは 150.0 MiB です。100 MiB を超えるファイルは、処理が遅くなったり、メモリが不足したりする場合があります。続行しますか？ 200 MiB を超えるファイルは開けません。",
    );
  });

  it("asks about a model with many triangles, in English as before", () => {
    expect(describeLimitRequest(triangles)).toBe(
      "dense.glb has more than 2,000,000 triangles. Large models can be slow or run out of memory. Continue? Models over 4,000,000 triangles cannot be opened.",
    );
  });

  it("asks about a model with many triangles, in Japanese", () => {
    expect(describeLimitRequest(triangles, "ja")).toBe(
      "dense.glb の三角形は 2,000,000 個を超えています。大きなモデルは、処理が遅くなったり、メモリが不足したりする場合があります。続行しますか？ 三角形が 4,000,000 個を超えるモデルは開けません。",
    );
  });

  it("takes the numbers from the limits it is given", () => {
    const text = describeLimitRequest({ ...size, limits: DEFAULT_LIMITS }, "en");

    expect(text).toContain("Files over 100 MiB cannot be opened.");
  });
});
