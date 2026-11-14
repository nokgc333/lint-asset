export function nextIndex(current: number, key: string, count: number): number {
  if (count === 0) return -1;
  switch (key) {
    case "Home":
      return 0;
    case "End":
      return count - 1;
    case "ArrowDown":
      return Math.min(current + 1, count - 1);
    case "ArrowUp":
      return current === -1 || current >= count ? count - 1 : Math.max(0, current - 1);
    default:
      return current >= count ? count - 1 : current;
  }
}
