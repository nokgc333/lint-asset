import { formatMiB } from "./file-size";
import type { Locale } from "./i18n/locale";
import { createTranslator } from "./i18n/translate";
import type { LimitRequest } from "./limit-dialog";
import { DEFAULT_LIMITS } from "./load-plan";
import { DEFAULT_MAX_PIXELS } from "./texture/texture-plan";
export function describeLimitRequest(request: LimitRequest, locale: Locale = "en"): string {
  const { t } = createTranslator(locale);
  const numbers = new Intl.NumberFormat(locale);
  if (request.reason === "pixels")
    return t("dialog.pixels", {
      name: request.fileName,
      width: request.width,
      height: request.height,
      defaultLimit: numbers.format(DEFAULT_MAX_PIXELS),
      maxLimit: numbers.format(request.maxPixels),
    });
  return request.reason === "size"
    ? t("dialog.size", {
        name: request.fileName,
        size: formatMiB(request.fileBytes, 1),
        defaultLimit: formatMiB(DEFAULT_LIMITS.maxFileBytes),
        maxLimit: formatMiB(request.limits.maxFileBytes),
      })
    : t("dialog.triangles", {
        name: request.fileName,
        defaultLimit: numbers.format(DEFAULT_LIMITS.maxTriangles),
        maxLimit: numbers.format(request.limits.maxTriangles),
      });
}
