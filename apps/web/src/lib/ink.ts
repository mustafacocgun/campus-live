/** WCAG relative luminance of a #rrggbb color. */
function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * The icon color on a filled mark: white while it keeps the 3:1 that WCAG asks of graphics, near-black
 * otherwise (white on the amber "Orta" and the grey "Veri yok" falls below it).
 */
export function inkOn(hex: string): string {
  return 1.05 / (luminance(hex) + 0.05) >= 3 ? "#ffffff" : "#0f172a";
}
