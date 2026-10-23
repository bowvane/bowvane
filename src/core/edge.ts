type Point = { x: number; y: number };
type Rect = Point & { width: number; height: number };

/** Bande du bord gauche qui fait apparaître la sidebar repliée : elle déborde un peu hors de la fenêtre. */
const EDGE_OUT = 6;
const EDGE_IN = 16;
/** Marge tolérée à droite du panneau flottant avant de le refermer. */
const KEEP_MARGIN = 40;

/** Décide, d’après la position du pointeur à l’écran, d’ouvrir, garder ou refermer la sidebar flottante. */
export function sidebarEdge(cursor: Point, win: Rect, sidebarWidth: number, floating: boolean): "open" | "keep" | "close" {
  const inHeight = cursor.y >= win.y && cursor.y < win.y + win.height;
  const left = win.x - EDGE_OUT;
  if (!floating) return inHeight && cursor.x >= left && cursor.x <= win.x + EDGE_IN ? "open" : "keep";
  return inHeight && cursor.x >= left && cursor.x <= win.x + sidebarWidth + KEEP_MARGIN ? "keep" : "close";
}
