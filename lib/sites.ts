// Apps on the same site share one browser session, so each site gets its own colour edge.
const SITE_COLOURS = ['var(--color-ink)', 'var(--color-violet)', 'var(--color-teal)', 'var(--color-amber)'];

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
