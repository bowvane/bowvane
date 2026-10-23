import type { Visit } from "./model";
import { looksLikeAddress, searchUrl, toNavigableUrl } from "./url";

export type CommandAction =
  | "newSpace" | "clearToday" | "split" | "closeSplit" | "littleArc" | "copyUrl" | "copyMarkdown"
  | "capture" | "toggleSidebar" | "pin" | "duplicate" | "reloadHard" | "muteAll" | "archive"
  | "history" | "downloads" | "boost" | "zap" | "settings" | "importArc" | "devtools" | "private";

export const ACTIONS: { action: CommandAction; label: string; keys: string; hint?: string }[] = [
  { action: "newSpace", label: "Nouveau Space", keys: "space espace nouveau new" },
  { action: "clearToday", label: "Vider Today", keys: "clear today vider archive", hint: "⇧⌘K" },
  { action: "split", label: "Ajouter un Split View", keys: "split view diviser", hint: "⌃⇧=" },
  { action: "closeSplit", label: "Fermer le volet du Split View", keys: "split close fermer", hint: "⌃⇧-" },
  { action: "littleArc", label: "Nouvelle fenêtre Little Arc", keys: "little arc mini fenetre", hint: "⌥⌘N" },
  { action: "private", label: "Nouvelle fenêtre privée", keys: "private privee incognito", hint: "⇧⌘N" },
  { action: "copyUrl", label: "Copier l’URL", keys: "copy copier url lien", hint: "⇧⌘C" },
  { action: "copyMarkdown", label: "Copier l’URL en Markdown", keys: "copy markdown lien", hint: "⌥⇧⌘C" },
  { action: "capture", label: "Capturer la page", keys: "capture screenshot capture ecran", hint: "⇧⌘2" },
  { action: "toggleSidebar", label: "Afficher / masquer la sidebar", keys: "sidebar barre", hint: "⌘S" },
  { action: "pin", label: "Épingler / désépingler l’onglet", keys: "pin epingler unpin", hint: "⌘D" },
  { action: "duplicate", label: "Dupliquer l’onglet", keys: "duplicate dupliquer" },
  { action: "reloadHard", label: "Recharger sans cache", keys: "reload hard cache recharger", hint: "⇧⌘R" },
  { action: "muteAll", label: "Couper le son de tous les onglets", keys: "mute son silence" },
  { action: "archive", label: "Voir l’archive", keys: "archive archives" },
  { action: "history", label: "Voir l’historique", keys: "history historique", hint: "⌘Y" },
  { action: "downloads", label: "Voir les téléchargements", keys: "downloads telechargements", hint: "⇧⌘J" },
  { action: "boost", label: "Booster ce site (CSS / JS)", keys: "boost css js style" },
  { action: "zap", label: "Zap : masquer un élément", keys: "zap masquer cacher" },
  { action: "importArc", label: "Importer depuis Arc", keys: "import arc importer" },
  { action: "settings", label: "Réglages", keys: "settings reglages preferences", hint: "⌘," },
  { action: "devtools", label: "Outils de développement", keys: "devtools inspecter developer", hint: "⌥⌘I" },
];

export interface TabCandidate {
  id: string;
  title: string;
  url: string;
  spaceTitle: string;
}

export type CommandResult =
  | { kind: "switch"; tabId: string; title: string; subtitle: string }
  | { kind: "open"; url: string; title: string; subtitle: string }
  | { kind: "action"; action: CommandAction; title: string; subtitle: string };

const norm = (t: string) => t.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

/** Score simple : sous-chaîne > début de mot > sous-séquence ; 0 = pas de correspondance. */
export function score(query: string, text: string): number {
  const q = norm(query.trim());
  const t = norm(text);
  if (!q) return 1;
  const at = t.indexOf(q);
  if (at === 0) return 100;
  if (at > 0) return /[\s/.\-—]/.test(t[at - 1] ?? "") ? 80 : 60;
  let j = 0;
  for (const c of t) if (c === q[j]) j++;
  return j === q.length ? 20 : 0;
}

export function searchCommandBar(
  query: string,
  ctx: { tabs: TabCandidate[]; history: Visit[]; engine: string },
  limit = 9,
): CommandResult[] {
  const q = query.trim();
  if (!q) return ctx.tabs.slice(0, limit).map((t) => ({ kind: "switch", tabId: t.id, title: t.title, subtitle: `Onglet · ${t.spaceTitle}` }));

  const ranked: { r: CommandResult; s: number }[] = [];
  if (looksLikeAddress(q)) {
    const url = toNavigableUrl(q, ctx.engine);
    ranked.push({ r: { kind: "open", url, title: url, subtitle: "Ouvrir" }, s: 1000 });
  }
  const openUrls = new Set(ctx.tabs.map((t) => t.url));
  for (const t of ctx.tabs) {
    const s = Math.max(score(q, t.title), score(q, t.url));
    if (s) ranked.push({ r: { kind: "switch", tabId: t.id, title: t.title, subtitle: `Onglet · ${t.spaceTitle}` }, s: s + 10 });
  }
  const seen = new Set<string>();
  for (const v of ctx.history) {
    if (seen.has(v.url) || openUrls.has(v.url)) continue;
    seen.add(v.url);
    const s = Math.max(score(q, v.title), score(q, v.url));
    if (s) ranked.push({ r: { kind: "open", url: v.url, title: v.title || v.url, subtitle: `Historique · ${v.url}` }, s });
    if (seen.size > 2000) break;
  }
  for (const a of ACTIONS) {
    const s = Math.max(score(q, a.label), score(q, a.keys));
    if (s >= 60) ranked.push({ r: { kind: "action", action: a.action, title: a.label, subtitle: a.hint ?? "Action" }, s: s - 5 });
  }
  ranked.sort((a, b) => b.s - a.s);
  const out = ranked.slice(0, limit - 1).map((x) => x.r);
  out.push({ kind: "open", url: searchUrl(q, ctx.engine), title: `Rechercher « ${q} »`, subtitle: "Recherche web" });
  return out;
}
