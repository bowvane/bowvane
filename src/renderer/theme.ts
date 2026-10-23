import { useEffect, useSyncExternalStore } from "react";
import type { Space } from "../core/model";
import { isDark, spaceTheme } from "../core/theme";

const media = matchMedia("(prefers-color-scheme: dark)");
const subscribe = (cb: () => void) => (media.addEventListener("change", cb), () => media.removeEventListener("change", cb));

export const useSystemDark = () => useSyncExternalStore(subscribe, () => media.matches);

function apply(vars: Record<string, string>, dark: boolean) {
  const root = document.documentElement;
  root.dataset.theme = dark ? "dark" : "light";
  for (const [k, v] of Object.entries(vars)) root.style.setProperty(k, v);
}

/** Pose les variables du thème du Space sur la racine ; les feuilles de style ne lisent que [data-theme]. */
export function useSpaceTheme(space: Pick<Space, "color" | "appearance"> | undefined) {
  const systemDark = useSystemDark();
  useEffect(() => {
    if (!space) return;
    const t = spaceTheme(space, systemDark);
    apply({ "--bg": t.background, "--bg-deep": t.backgroundDeep, "--accent": t.accent, "--fg": t.foreground }, t.dark);
  }, [space?.color, space?.appearance, systemDark]);
}

/** Variante pour une fenêtre dont le main fournit déjà la couleur de fond (Little Bowvane). */
export function useFlatTheme(background: string | undefined, accent?: string) {
  useEffect(() => {
    if (!background) return;
    const dark = isDark(background);
    apply({ "--bg": background, "--bg-deep": background, "--accent": accent ?? (dark ? "#a598ff" : "#6f5df0"), "--fg": dark ? "#f4f2f7" : "#1d1b22" }, dark);
  }, [background, accent]);
}
