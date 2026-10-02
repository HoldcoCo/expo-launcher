// Apps on the same site share one browser session, so each site gets its own colour.
const SITE_COLOURS = [
  "#0C4881",
  "#6348B3",
  "#1F6F6B",
  "#9A5B0B",
  "#7A3E65",
  "#2F6B3A",
];

export function siteOf(url: string): string {
  try { return new URL(url).host; } catch { return url; }
}

/** Colour per site, assigned in the order sites first appear in the list, so it stays stable. */
export function siteColours(urls: string[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const url of urls) {
    const site = siteOf(url);
    if (!map.has(site)) map.set(site, SITE_COLOURS[map.size % SITE_COLOURS.length]);
  }
  return map;
}

/** Icon-chip background: site colour mixed 10% into white. */
export function chipBackground(siteColour: string): string {
  return `color-mix(in srgb, ${siteColour} 10%, white)`;
}
