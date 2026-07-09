export function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, '');
}

export async function fetchJson(url: string): Promise<{ status: number; body: unknown }> {
  const res = await fetch(url);
  const text = await res.text();
  let body: unknown = text;
  try {
    body = JSON.parse(text);
  } catch {
    // keep text
  }
  return { status: res.status, body };
}

export async function fetchText(url: string): Promise<{ status: number; text: string }> {
  const res = await fetch(url);
  return { status: res.status, text: await res.text() };
}

export function getPath(obj: unknown, keys: string[]): unknown {
  let cur: unknown = obj;
  for (const key of keys) {
    if (!cur || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[key];
  }
  return cur;
}

export function htmlHasNoindex(html: string): boolean {
  const robotsMatch = html.match(
    /<meta[^>]+name=["']robots["'][^>]+content=["']([^"']+)["']/i
  );
  if (!robotsMatch) {
    const contentFirst = html.match(
      /<meta[^>]+content=["']([^"']+)["'][^>]+name=["']robots["']/i
    );
    if (!contentFirst) return false;
    return contentFirst[1].toLowerCase().includes('noindex');
  }
  return robotsMatch[1].toLowerCase().includes('noindex');
}

export function buildForcedPreviewPath(
  template: string,
  forceOutcome: string
): string {
  return template.replace('{forceOutcome}', encodeURIComponent(forceOutcome));
}
