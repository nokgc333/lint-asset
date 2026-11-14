import { afterEach, describe, expect, it, vi } from "vitest";
import { setupAboutDialog } from "./about-dialog";
import { setDonateClickHandler } from "./links";
import { THIRD_PARTY_COMPONENTS } from "./third-party";

class FakeElement extends EventTarget {
  attributes = new Map<string, string>();
  children: FakeElement[] = [];
  textContent = "";
  open = false;
  hidden = false;
  focus = vi.fn();
  showModal: (() => void) | undefined = vi.fn(() => {
    this.open = true;
  });
  close = vi.fn(() => {
    this.open = false;
    this.dispatchEvent(new Event("close"));
  });
  setAttribute(name: string, value: string) {
    this.attributes.set(name, value);
    if (name === "open") this.open = true;
  }
  getAttribute(name: string) {
    return this.attributes.get(name) ?? null;
  }
  removeAttribute(name: string) {
    this.attributes.delete(name);
    if (name === "open") this.open = false;
  }
  append(...children: FakeElement[]) {
    this.children.push(...children);
  }
  getBoundingClientRect() {
    return { left: 10, right: 110, top: 10, bottom: 110 };
  }
}

function fixture() {
  const elements = new Map(
    ["about-dialog", "about-open", "about-close", "about-third-party"].map((id) => [
      id,
      new FakeElement(),
    ]),
  );
  const donate = new FakeElement();
  donate.setAttribute("data-link", "donate");
  const doc = {
    getElementById: (id: string) => elements.get(id) ?? null,
    querySelectorAll: () => [donate],
    createElement: () => new FakeElement(),
  } as unknown as Document;
  const dialog = elements.get("about-dialog") as FakeElement;
  const opener = elements.get("about-open") as FakeElement;
  const closer = elements.get("about-close") as FakeElement;
  const list = elements.get("about-third-party") as FakeElement;
  return { doc, dialog, opener, closer, list, donate };
}

function clickAt(target: FakeElement, x: number, y: number) {
  const event = new Event("click");
  Object.assign(event, { clientX: x, clientY: y });
  target.dispatchEvent(event);
}

afterEach(() => setDonateClickHandler(null));

describe("About dialog", () => {
  it("opens modally and closes with the button, restoring focus", () => {
    const { doc, dialog, opener, closer } = fixture();
    setupAboutDialog(doc);
    opener.dispatchEvent(new Event("click"));
    expect(dialog.showModal).toHaveBeenCalledOnce();
    expect(dialog.open).toBe(true);
    closer.dispatchEvent(new Event("click"));
    expect(dialog.open).toBe(false);
    expect(opener.focus).toHaveBeenCalledOnce();
  });

  it.each(["missing", "throwing"])("falls back when showModal is %s", (mode) => {
    const { doc, dialog, opener, closer } = fixture();
    dialog.showModal =
      mode === "missing"
        ? undefined
        : () => {
            throw new Error("unavailable");
          };
    setupAboutDialog(doc);
    opener.dispatchEvent(new Event("click"));
    expect(dialog.getAttribute("open")).toBe("");
    closer.dispatchEvent(new Event("click"));
    expect(dialog.open).toBe(false);
  });

  it("closes on Escape via cancel", () => {
    const { doc, dialog, opener } = fixture();
    setupAboutDialog(doc);
    opener.dispatchEvent(new Event("click"));
    const event = new Event("cancel", { cancelable: true });
    dialog.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    expect(dialog.open).toBe(false);
    expect(opener.focus).toHaveBeenCalledOnce();
  });

  it("closes only for clicks outside the dialog bounds", () => {
    const { doc, dialog, opener, list } = fixture();
    setupAboutDialog(doc);
    opener.dispatchEvent(new Event("click"));
    clickAt(dialog, 20, 20);
    list.dispatchEvent(new Event("click", { bubbles: true }));
    expect(dialog.open).toBe(true);
    clickAt(dialog, 0, 0);
    expect(dialog.open).toBe(false);
    expect(opener.focus).toHaveBeenCalledOnce();
  });

  it("fills the list once with plain text and safe project links", () => {
    const { doc, list, opener, closer } = fixture();
    setupAboutDialog(doc);
    opener.dispatchEvent(new Event("click"));
    closer.dispatchEvent(new Event("click"));
    opener.dispatchEvent(new Event("click"));
    expect(list.children).toHaveLength(THIRD_PARTY_COMPONENTS.length);
    for (const [index, component] of THIRD_PARTY_COMPONENTS.entries()) {
      const link = list.children[index]?.children[0];
      expect(link?.textContent).toBe(
        `${component.name}${component.version ? ` ${component.version}` : ""} - ${component.license}`,
      );
      expect(link?.getAttribute("href")).toBe(component.url);
      expect(link?.getAttribute("target")).toBe("_blank");
      expect(link?.getAttribute("rel")).toBe("noopener noreferrer");
    }
  });

  it("wires donation clicks to the optional local hook", () => {
    const { doc, donate } = fixture();
    const handler = vi.fn();
    setDonateClickHandler(handler);
    setupAboutDialog(doc);
    expect(donate.hidden).toBe(true);
    expect(donate.getAttribute("href")).toBeNull();
    donate.dispatchEvent(new Event("click"));
    expect(handler).toHaveBeenCalledOnce();
  });
});
