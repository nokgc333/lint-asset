interface ScrollPane {
  scrollTop: number;
  scrollLeft: number;
  scrollHeight: number;
  scrollWidth: number;
  clientHeight: number;
  clientWidth: number;
  addEventListener(type: "scroll", listener: () => void): void;
}

export function linkTexturePanes(panes: readonly ScrollPane[]): void {
  const expected = new WeakMap<ScrollPane, { top: number; left: number }>();
  for (const pane of panes)
    pane.addEventListener("scroll", () => {
      const previous = expected.get(pane);
      expected.delete(pane);
      if (previous?.top === pane.scrollTop && previous.left === pane.scrollLeft) return;
      const top = pane.scrollTop / Math.max(1, pane.scrollHeight - pane.clientHeight);
      const left = pane.scrollLeft / Math.max(1, pane.scrollWidth - pane.clientWidth);
      for (const other of panes) {
        if (other === pane) continue;
        other.scrollTop = Math.round(top * Math.max(0, other.scrollHeight - other.clientHeight));
        other.scrollLeft = Math.round(left * Math.max(0, other.scrollWidth - other.clientWidth));
        expected.set(other, { top: other.scrollTop, left: other.scrollLeft });
      }
    });
}
