import type { Rule, RouteTarget } from "./model";

function matches(url: URL, pattern: string): boolean {
  const p = pattern.trim().toLowerCase().replace(/^[a-z]+:\/\//, "");
  if (!p) return false;
  const slash = p.indexOf("/");
  const host = slash === -1 ? p : p.slice(0, slash);
  const path = slash === -1 ? "" : p.slice(slash);
  const h = url.hostname.toLowerCase();
  const hostOk = h === host || h.endsWith(`.${host}`);
  return hostOk && (path === "" || url.pathname.toLowerCase().startsWith(path));
}

/** Air Traffic Control : première règle qui correspond, sinon null. */
export function routeUrl(raw: string, rules: Rule[]): RouteTarget | null {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  return rules.find((r) => matches(url, r.match))?.target ?? null;
}
