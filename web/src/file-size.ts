const BYTES_PER_MIB = 1024 * 1024;

export function formatMiB(bytes: number, fractionDigits = 0): string {
  const numbers = new Intl.NumberFormat("en", {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  });
  return `${numbers.format(bytes / BYTES_PER_MIB)} MiB`;
}
