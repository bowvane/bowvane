import type { Space } from "./model";

export interface SpaceTheme {
  dark: boolean;
  /** Fond de la fenêtre autour de la page (sidebar comprise). */
  background: string;
  /** Même teinte, plus marquée, pour le dégradé. */
  backgroundDeep: string;
  accent: string;
  foreground: string;
}

const NEUTRAL = { light: "#e9e7ee", dark: "#1c1a21" };

function rgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  const n = parseInt(h.length === 3 ? h.replace(/./g, "$&$&") : h.slice(0, 6), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

const toHex = (c: number[]) => `#${c.map((v) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, "0")).join("")}`;

/** Mélange linéaire : t = 0 donne a, t = 1 donne b. */
export function mix(a: string, b: string, t: number): string {
  const x = rgb(a);
  const y = rgb(b);
  return toHex(x.map((v, i) => v + (y[i]! - v) * t));
}

/** Thème d’un Space façon Arc : couleur atténuée vers le blanc (clair) ou le noir (sombre), texte contrasté. */
export function spaceTheme(space: Pick<Space, "color" | "appearance">, systemDark: boolean): SpaceTheme {
  const dark = space.appearance === "dark" || (space.appearance === "system" && systemDark);
  if (!space.color) {
    const background = dark ? NEUTRAL.dark : NEUTRAL.light;
    return { dark, background, backgroundDeep: mix(background, dark ? "#000000" : "#c9c5d3", 0.35), accent: dark ? "#a598ff" : "#6f5df0", foreground: dark ? "#f2f0f6" : "#1d1b22" };
  }
  const background = dark ? mix(space.color, "#000000", 0.62) : mix(space.color, "#ffffff", 0.5);
  const backgroundDeep = dark ? mix(space.color, "#000000", 0.78) : mix(space.color, "#ffffff", 0.28);
  return { dark, background, backgroundDeep, accent: space.color, foreground: dark ? "#f4f2f7" : "#1d1b22" };
}

/** Luminance relative approchée (0 noir, 1 blanc) pour choisir un texte lisible. */
export function isDark(hex: string): boolean {
  const [r, g, b] = rgb(hex);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b < 140;
}
