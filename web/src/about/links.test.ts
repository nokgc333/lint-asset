import { describe, expect, it, vi } from "vitest";
import {
  applyAboutLinks,
  buildAboutLinks,
  DONATION_URL,
  notifyDonateClick,
  REPOSITORY_URL,
  setDonateClickHandler,
} from "./links";

interface FakeLink {
  attributes: Map<string, string>;
  hidden: boolean;
  getAttribute(name: string): string | null;
  setAttribute(name: string, value: string): void;
}

function fakeLink(link: string): FakeLink {
  const attributes = new Map<string, string>([["data-link", link]]);
  return {
    attributes,
    hidden: false,
    getAttribute: (name) => attributes.get(name) ?? null,
    setAttribute: (name, value) => {
      attributes.set(name, value);
    },
  };
}

function fakeRoot(...links: FakeLink[]) {
  return { querySelectorAll: (_selector: string) => links };
}

describe("the link targets", () => {
  it("point to the public repository on GitHub", () => {
    expect(REPOSITORY_URL).toBe("https://github.com/nokgc333/lint-asset");
  });

  it("have no donation link until the Sponsors profile is approved", () => {
    expect(DONATION_URL).toBeNull();
  });
});

describe("buildAboutLinks", () => {
  it("builds the repository, license, and notices links from the repository URL", () => {
    expect(buildAboutLinks(null)).toEqual({
      github: "https://github.com/nokgc333/lint-asset",
      license: "https://github.com/nokgc333/lint-asset/blob/main/LICENSE",
      notices: "https://github.com/nokgc333/lint-asset/blob/main/THIRD_PARTY_NOTICES",
      donate: null,
    });
  });

  it("includes the donation link when one is set", () => {
    expect(buildAboutLinks("https://github.com/sponsors/example").donate).toBe(
      "https://github.com/sponsors/example",
    );
  });

  it("drops a donation link that is not a plain https URL", () => {
    for (const bad of [
      "http://github.com/sponsors/example",
      "javascript:alert(1)",
      "data:text/html,x",
      "//example.com",
      "",
      "not a url",
      "https://user:pass@github.com/sponsors/example",
    ]) {
      expect(buildAboutLinks(bad).donate, bad).toBeNull();
    }
  });

  it("uses the configured donation link by default", () => {
    expect(buildAboutLinks().donate).toBe(DONATION_URL);
  });
});

describe("applyAboutLinks", () => {
  const links = buildAboutLinks("https://github.com/sponsors/example");

  it("sets the address of every link and opens it safely in a new tab", () => {
    const github = fakeLink("github");
    const notices = fakeLink("notices");
    applyAboutLinks(fakeRoot(github, notices), links);
    expect(github.attributes.get("href")).toBe(links.github);
    expect(notices.attributes.get("href")).toBe(links.notices);
    for (const element of [github, notices]) {
      expect(element.attributes.get("target")).toBe("_blank");
      expect(element.attributes.get("rel")).toBe("noopener noreferrer");
      expect(element.hidden).toBe(false);
    }
  });

  it("shows the donation link when there is a donation URL", () => {
    const donate = fakeLink("donate");
    donate.hidden = true;
    applyAboutLinks(fakeRoot(donate), links);
    expect(donate.hidden).toBe(false);
    expect(donate.attributes.get("href")).toBe("https://github.com/sponsors/example");
  });

  it("hides the donation link and gives it no address when there is no donation URL", () => {
    const donate = fakeLink("donate");
    applyAboutLinks(fakeRoot(donate), buildAboutLinks(null));
    expect(donate.hidden).toBe(true);
    expect(donate.attributes.has("href")).toBe(false);
  });

  it("leaves an unknown link name alone", () => {
    const other = fakeLink("unknown");
    applyAboutLinks(fakeRoot(other), links);
    expect(other.attributes.has("href")).toBe(false);
  });
});

describe("the donation click hook", () => {
  it("does nothing when no handler is set", () => {
    setDonateClickHandler(null);
    expect(() => notifyDonateClick()).not.toThrow();
  });

  it("calls the handler once per click", () => {
    const handler = vi.fn();
    setDonateClickHandler(handler);
    notifyDonateClick();
    notifyDonateClick();
    expect(handler).toHaveBeenCalledTimes(2);
    setDonateClickHandler(null);
  });

  it("does not let a failing handler stop the click", () => {
    setDonateClickHandler(() => {
      throw new Error("boom");
    });
    expect(() => notifyDonateClick()).not.toThrow();
    setDonateClickHandler(null);
  });

  it("stops calling a handler that was removed", () => {
    const handler = vi.fn();
    setDonateClickHandler(handler);
    setDonateClickHandler(null);
    notifyDonateClick();
    expect(handler).not.toHaveBeenCalled();
  });
});
