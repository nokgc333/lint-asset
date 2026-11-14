import { describe, expect, it, vi } from "vitest";
import { setupSettingsDialog } from "./settings-dialog";
import { DEFAULT_THRESHOLDS } from "./thresholds";

class FakeElement extends EventTarget {
  value = "";
  textContent = "";
  open = false;
  attributes = new Map<string, string>();
  focus = vi.fn();
  showModal: (() => void) | undefined = () => {
    this.open = true;
  };
  close() {
    this.open = false;
    this.dispatchEvent(new Event("close"));
  }
  setAttribute(key: string, value: string) {
    this.attributes.set(key, value);
    if (key === "open") this.open = true;
  }
  removeAttribute(key: string) {
    this.attributes.delete(key);
    if (key === "open") this.open = false;
  }
  getBoundingClientRect() {
    return { left: 10, right: 100, top: 10, bottom: 100 };
  }
}
function fixture() {
  const ids = [
    "open",
    "dialog",
    "save",
    "reset",
    "cancel",
    "max-triangles",
    "min-extent",
    "max-extent",
    "max-triangles-hint",
    "min-extent-hint",
    "max-extent-hint",
    "max-triangles-error",
    "min-extent-error",
    "max-extent-error",
  ];
  const elements = new Map(ids.map((id) => [`settings-${id}`, new FakeElement()]));
  const storage = { getItem: vi.fn(), setItem: vi.fn() };
  const doc = {
    getElementById: (id: string) => elements.get(id),
    defaultView: { localStorage: storage },
  } as unknown as Document;
  const onSave = vi.fn();
  let locale: "en" | "ja" = "en";
  const api = setupSettingsDialog({
    doc,
    getThresholds: () => ({ ...DEFAULT_THRESHOLDS, max_triangles: 50 }),
    onSave,
    getLocale: () => locale,
  });
  const element = (id: string) => elements.get(`settings-${id}`) as FakeElement;
  const click = (id: string) => element(id).dispatchEvent(new Event("click"));
  return {
    ...api,
    element,
    click,
    onSave,
    storage,
    japanese: () => {
      locale = "ja";
      api.refresh();
    },
  };
}
describe("settings dialog", () => {
  it("fills current values, resets only the draft, and saves validated defaults", () => {
    const f = fixture();
    f.click("open");
    expect(f.element("max-triangles").value).toBe("50");
    f.click("reset");
    expect(f.onSave).not.toHaveBeenCalled();
    expect(f.storage.setItem).not.toHaveBeenCalled();
    f.click("save");
    expect(f.onSave).toHaveBeenCalledWith(DEFAULT_THRESHOLDS);
    expect(f.storage.setItem).toHaveBeenCalledOnce();
    expect(f.element("dialog").open).toBe(false);
    expect(f.element("open").focus).toHaveBeenCalledOnce();
  });
  it("focuses the first invalid input, translates errors and clears them on reopening", () => {
    const f = fixture();
    f.click("open");
    f.element("min-extent").value = "bad";
    f.element("max-extent").value = "";
    f.click("save");
    expect(f.element("dialog").open).toBe(true);
    expect(f.element("min-extent").focus).toHaveBeenCalled();
    expect(f.element("min-extent").attributes.get("aria-invalid")).toBe("true");
    expect(f.element("min-extent-error").textContent).toContain("Enter a number");
    f.japanese();
    expect(f.element("min-extent-error").textContent).toContain("数値");
    f.click("cancel");
    f.click("open");
    expect(f.element("min-extent-error").textContent).toBe("");
    expect(f.onSave).not.toHaveBeenCalled();
  });
  it.each(["cancel", "escape", "backdrop"])(
    "closes without saving via %s, including fallback",
    (method) => {
      const f = fixture();
      f.element("dialog").showModal = undefined;
      f.click("open");
      if (method === "cancel") f.click("cancel");
      else if (method === "escape")
        f.element("dialog").dispatchEvent(new Event("cancel", { cancelable: true }));
      else {
        const event = new Event("click");
        Object.assign(event, { clientX: 0, clientY: 0 });
        f.element("dialog").dispatchEvent(event);
      }
      expect(f.element("dialog").open).toBe(false);
      expect(f.onSave).not.toHaveBeenCalled();
      expect(f.element("open").focus).toHaveBeenCalledOnce();
    },
  );
  it("saves in memory even when access to storage throws", () => {
    const f = fixture();
    f.storage.setItem.mockImplementation(() => {
      throw new Error("blocked");
    });
    f.click("open");
    f.click("save");
    expect(f.onSave).toHaveBeenCalled();
  });
});
