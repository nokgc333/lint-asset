import { expect, it } from "vitest";
import { linkTexturePanes } from "./texture-scroll";

function pane(width: number, height: number) {
  return Object.assign(new EventTarget(), {
    scrollTop: 0,
    scrollLeft: 0,
    scrollWidth: width,
    scrollHeight: height,
    clientWidth: 100,
    clientHeight: 100,
  });
}

it("keeps differently sized panes at the same relative position", () => {
  const small = pane(300, 500);
  const large = pane(500, 900);
  const third = pane(100, 100);
  linkTexturePanes([small, large, third]);
  small.scrollTop = 200;
  small.scrollLeft = 100;
  small.dispatchEvent(new Event("scroll"));
  expect(large.scrollTop).toBe(400);
  expect(large.scrollLeft).toBe(200);
  expect(third.scrollTop).toBe(0);
  expect(third.scrollLeft).toBe(0);
  large.scrollTop = 800;
  large.scrollLeft = 400;
  large.dispatchEvent(new Event("scroll"));
  expect(small.scrollTop).toBe(400);
  expect(small.scrollLeft).toBe(200);
});

it("ignores programmatic scroll events so rounding cannot pull the source back", () => {
  const source = pane(100, 900);
  const target = pane(100, 101);
  linkTexturePanes([source, target]);
  source.scrollTop = 500;
  source.dispatchEvent(new Event("scroll"));
  expect(target.scrollTop).toBe(1);
  target.dispatchEvent(new Event("scroll"));
  expect(source.scrollTop).toBe(500);
  target.scrollTop = 0;
  target.dispatchEvent(new Event("scroll"));
  expect(source.scrollTop).toBe(0);
});
