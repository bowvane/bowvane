/** Extensions Chrome reprises d’Arc : lecture des préférences et des manifestes, sans Electron. */

export interface ExtensionInfo {
  name: string;
  /** Chemin de la popup du bouton d’action, relatif au dossier de l’extension. */
  popup: string | null;
  /** Icône la plus proche de 32 px, relative au dossier de l’extension. */
  icon: string | null;
  manifestVersion: number;
}

type Messages = Record<string, { message?: string }> | null;

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/** Même clé que les Spaces importés : le profil par défaut d’Arc devient « default ». */
export function arcProfileKey(dir: string): string {
  return dir === "Default" ? "default" : `arc-${dir}`;
}

/** Extensions installées par l’utilisateur (location 1) et activées (aucune raison de désactivation). */
export function enabledArcExtensionIds(securePrefs: unknown): string[] {
  const settings = isObj(securePrefs) && isObj(securePrefs.extensions) ? securePrefs.extensions.settings : null;
  if (!isObj(settings)) return [];
  return Object.entries(settings)
    .filter(([, s]) => isObj(s) && s.location === 1 && (!Array.isArray(s.disable_reasons) || s.disable_reasons.length === 0))
    .map(([id]) => id);
}

/** Ordre de la barre d’Arc (Preferences › extensions.pinned_extensions), réduit aux extensions importées. */
export function arcPinnedExtensionIds(prefs: unknown, imported: string[]): string[] {
  const pinned = isObj(prefs) && isObj(prefs.extensions) ? prefs.extensions.pinned_extensions : null;
  if (!Array.isArray(pinned)) return [];
  return pinned.filter((id): id is string => typeof id === "string" && imported.includes(id));
}

/** Épingler ajoute à la fin de la barre, comme Arc ; désépingler retire. */
export function setPinned(pinned: string[], id: string, pin: boolean): string[] {
  if (pin) return pinned.includes(id) ? pinned : [...pinned, id];
  return pinned.filter((x) => x !== id);
}

const versionParts = (v: string) => v.split(/[._]/).map((n) => Number.parseInt(n, 10) || 0);

/** Chrome garde une copie par version (« 1.10.2_0 ») : on prend la plus récente. */
export function latestVersion(dirs: string[]): string | null {
  const sorted = [...dirs].sort((a, b) => {
    const x = versionParts(a), y = versionParts(b);
    for (let i = 0; i < Math.max(x.length, y.length); i++) if ((x[i] ?? 0) !== (y[i] ?? 0)) return (x[i] ?? 0) - (y[i] ?? 0);
    return 0;
  });
  return sorted.at(-1) ?? null;
}

function pickIcon(icons: unknown): string | null {
  if (typeof icons === "string") return icons;
  if (!isObj(icons)) return null;
  const sizes = Object.keys(icons).map(Number).filter((n) => n > 0 && typeof icons[String(n)] === "string").sort((a, b) => a - b);
  const size = sizes.find((n) => n >= 32) ?? sizes.at(-1);
  return size === undefined ? null : (icons[String(size)] as string);
}

export function describeExtension(manifest: unknown, messages: Messages): ExtensionInfo {
  const m = isObj(manifest) ? manifest : {};
  const action = isObj(m.action) ? m.action : isObj(m.browser_action) ? m.browser_action : {};
  let name = typeof m.name === "string" ? m.name : "";
  const key = /^__MSG_(.+)__$/.exec(name)?.[1]?.toLowerCase();
  if (key && messages) {
    const found = Object.entries(messages).find(([k]) => k.toLowerCase() === key)?.[1]?.message;
    if (found) name = found;
  }
  return {
    name,
    popup: typeof action.default_popup === "string" && action.default_popup ? action.default_popup : null,
    icon: pickIcon(action.default_icon) ?? pickIcon(m.icons),
    manifestVersion: typeof m.manifest_version === "number" ? m.manifest_version : 2,
  };
}
