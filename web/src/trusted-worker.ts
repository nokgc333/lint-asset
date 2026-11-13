// Starts the core worker under the page's Trusted Types policy.
//
// The production CSP has `require-trusted-types-for 'script'`, which makes `new Worker(url)`
// refuse a plain string. A policy hands back a TrustedScriptURL, and only for a script on the
// page's own origin, so the page can never start a worker from anywhere else.

export const WORKER_POLICY_NAME = "lint-asset-worker";

/** Returns the absolute URL when it is on the same origin as `base`, and throws otherwise. */
export function sameOriginScriptUrl(input: string, base: string): string {
  const url = new URL(input, base);
  // A blob: URL reports its creator's origin, so the scheme has to be checked on its own.
  const isWeb = url.protocol === "https:" || url.protocol === "http:";
  if (!isWeb || url.origin !== new URL(base).origin) {
    throw new TypeError("A worker script must come from the page's own origin.");
  }
  return url.href;
}

// The DOM typings do not include Trusted Types yet, so only the part used here is declared.
interface TrustedTypePolicyLike {
  createScriptURL(input: string): unknown;
}
interface TrustedTypesLike {
  createPolicy(
    name: string,
    rules: { createScriptURL(input: string): string },
  ): TrustedTypePolicyLike;
}

export function createModuleWorker(scriptUrl: string): Worker {
  const trustedTypes = (window as unknown as { trustedTypes?: TrustedTypesLike }).trustedTypes;
  const policy = trustedTypes?.createPolicy(WORKER_POLICY_NAME, {
    createScriptURL: (input: string) => sameOriginScriptUrl(input, location.href),
  });
  // Without Trusted Types (older browsers), the browser accepts the plain URL.
  const source = policy ? policy.createScriptURL(scriptUrl) : scriptUrl;
  return new Worker(source as unknown as string, { type: "module" });
}
