export const REPOSITORY_URL = "https://github.com/nokgc333/lint-asset";
export const DONATION_URL: string | null = null;

export interface AboutLinks {
  github: string;
  license: string;
  notices: string;
  donate: string | null;
}

function validatedDonationUrl(value: string | null): string | null {
  if (!value?.startsWith("https://")) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password ? value : null;
  } catch {
    return null;
  }
}

export function buildAboutLinks(donationUrl: string | null = DONATION_URL): AboutLinks {
  return {
    github: REPOSITORY_URL,
    license: `${REPOSITORY_URL}/blob/main/LICENSE`,
    notices: `${REPOSITORY_URL}/blob/main/THIRD_PARTY_NOTICES`,
    donate: validatedDonationUrl(donationUrl),
  };
}

interface LinkElement {
  hidden: boolean;
  getAttribute(name: string): string | null;
  setAttribute(name: string, value: string): void;
  removeAttribute?(name: string): void;
}

export function applyAboutLinks(
  root: { querySelectorAll(selector: string): Iterable<LinkElement> },
  links: AboutLinks,
): void {
  for (const element of root.querySelectorAll("[data-link]")) {
    const name = element.getAttribute("data-link");
    if (name !== "github" && name !== "license" && name !== "notices" && name !== "donate")
      continue;
    const href = links[name];
    element.hidden = href === null;
    if (href === null) {
      element.removeAttribute?.("href");
      continue;
    }
    element.setAttribute("href", href);
    element.setAttribute("target", "_blank");
    element.setAttribute("rel", "noopener noreferrer");
  }
}

let donateClickHandler: (() => void) | null = null;

export function setDonateClickHandler(handler: (() => void) | null): void {
  donateClickHandler = handler;
}

export function notifyDonateClick(): void {
  try {
    donateClickHandler?.();
  } catch {}
}
