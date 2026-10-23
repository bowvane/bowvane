const SAFE_SCHEME = /^(https?|file|about|bowvane):/i;
const LOCALHOST = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?(\/.*)?$/i;
const DOMAIN = /^[\w-]+(\.[\w-]+)+(:\d+)?(\/\S*)?$/;

export function searchUrl(query: string, engine: string): string {
  return engine.replace("%s", encodeURIComponent(query));
}

/** Transforme une saisie de barre d’adresse en URL ; tout le reste devient une recherche. */
export function toNavigableUrl(input: string, engine: string): string {
  const text = input.trim();
  if (SAFE_SCHEME.test(text) && /^[a-z]+:\/\//i.test(text)) return text;
  if (/^about:/i.test(text)) return text;
  if (LOCALHOST.test(text)) return `http://${text}`;
  if (!/\s/.test(text) && DOMAIN.test(text)) return `https://${text}`;
  return searchUrl(text, engine);
}

export function looksLikeAddress(input: string): boolean {
  const text = input.trim();
  return /^[a-z]+:\/\//i.test(text) || LOCALHOST.test(text) || (!/\s/.test(text) && DOMAIN.test(text));
}

export function hostOf(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return "";
  }
}

const registrable = (host: string) => host.split(".").slice(-2).join(".");

/** Peek : un lien qui quitte le site d’un favori s’ouvre en aperçu, sauf les pages de connexion. */
export function shouldPeek(pinnedUrl: string, target: string): boolean {
  const from = hostOf(pinnedUrl);
  const to = hostOf(target);
  if (!from || !to || registrable(from) === registrable(to)) return false;
  return !/(^|\.|\/\/)(accounts|login|auth|sso|signin|id)\.|oauth|saml|\/login|\/signin|\/auth/i.test(target);
}
