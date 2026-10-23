import { useRef, useState, type DragEvent, type PointerEvent, type ReactNode } from "react";
import { displayTitle, type Item, type TabItem, type Zone } from "../core/model";
import type { Snapshot } from "../shared/ipc";
import { Favicon } from "./Favicon";
import { FolderIcon, Icon } from "./Icon";
import { faviconFor, send, useUi } from "./store";
import { useSpaceTheme } from "./theme";

const DRAG = "application/x-bowvane-item";
const PAD = 10;

function children(snap: Snapshot, zone: Zone, parentId: string | null): Item[] {
  const s = snap.state;
  return s.items.filter((i) => i.zone === zone && i.parentId === parentId && (zone === "favorites" || i.spaceId === s.activeSpaceId));
}

function dropOn(e: DragEvent, zone: Zone, parentId: string | null, index: number) {
  const id = e.dataTransfer.getData(DRAG);
  if (!id) return;
  e.preventDefault();
  e.stopPropagation();
  send({ type: "move", id, to: { zone, parentId, index } });
}

const allowDrop = (e: DragEvent) => {
  if (e.dataTransfer.types.includes(DRAG)) e.preventDefault();
};

/** Arc remplit la largeur : 3 favoris = 3 colonnes, au-delà la grille se resserre. */
const favColumns = (n: number) => (n <= 4 ? Math.max(n, 1) : n <= 6 ? 3 : 4);

function hostLabel(url: string | undefined): string {
  if (!url) return "";
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function RenameInput({ id, value }: { id: string; value: string }) {
  const setRenaming = useUi((s) => s.setRenaming);
  const done = (title: string | null) => {
    if (title !== null) send({ type: "rename", id, title });
    setRenaming(null);
  };
  return (
    <input
      className="rename"
      autoFocus
      defaultValue={value}
      onFocus={(e) => e.currentTarget.select()}
      onBlur={(e) => done(e.currentTarget.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter") done(e.currentTarget.value);
        if (e.key === "Escape") done(null);
      }}
    />
  );
}

function TabRow({ snap, tab, depth, index }: { snap: Snapshot; tab: TabItem; depth: number; index: number }) {
  const renaming = useUi((s) => s.renaming === tab.id);
  const setRenaming = useUi((s) => s.setRenaming);
  const active = snap.state.activeTabBySpace[snap.state.activeSpaceId] === tab.id;
  const rt = snap.runtime[tab.id];
  const inSplit = snap.split && (snap.split.primary === tab.id || snap.split.secondary === tab.id);
  const title = displayTitle(tab);
  return (
    <div
      className={`row tab ${active ? "active" : ""} ${rt?.loaded ? "" : "unloaded"}`}
      style={{ paddingLeft: 10 + depth * 16 }}
      draggable
      data-testid={`tab-${tab.zone}`}
      title={tab.url}
      onDragStart={(e) => e.dataTransfer.setData(DRAG, tab.id)}
      onDragOver={allowDrop}
      onDrop={(e) => dropOn(e, tab.zone, tab.zone === "pinned" ? tab.parentId : null, index)}
      onClick={() => send({ type: "activateTab", id: tab.id })}
      onDoubleClick={() => setRenaming(tab.id)}
      onAuxClick={(e) => e.button === 1 && send({ type: "closeTab", id: tab.id })}
      onContextMenu={(e) => (e.preventDefault(), send({ type: "contextMenu", id: tab.id }))}
    >
      <span className="lead">{rt?.loading ? <span className="spinner" /> : <Favicon src={faviconFor(snap, tab.url)} title={title} />}</span>
      {renaming ? <RenameInput id={tab.id} value={title} /> : <span className="label">{title}</span>}
      {inSplit && <span className="badge" title="Split View"><Icon name="split" size={13} /></span>}
      {(rt?.audible || rt?.muted) && (
        <button className="icon small audio" title={rt.muted ? "Réactiver le son" : "Couper le son"} onClick={(e) => (e.stopPropagation(), send({ type: "toggleMute", id: tab.id }))}>
          <Icon name={rt.muted ? "muted" : "speaker"} size={14} />
        </button>
      )}
      <button
        className="icon small close"
        title={tab.zone === "today" ? "Fermer (⌘W)" : "Décharger"}
        onClick={(e) => (e.stopPropagation(), send({ type: "closeTab", id: tab.id }))}
      >
        <Icon name={tab.zone === "today" ? "close" : "minus"} size={13} />
      </button>
    </div>
  );
}

function Tree({ snap, parentId, depth }: { snap: Snapshot; parentId: string | null; depth: number }): ReactNode {
  const renamingId = useUi((s) => s.renaming);
  return children(snap, "pinned", parentId).map((item, index) =>
    item.kind === "tab" ? (
      <TabRow key={item.id} snap={snap} tab={item} depth={depth} index={index} />
    ) : (
      <div key={item.id} className="group">
        <div
          className="row folder"
          style={{ paddingLeft: 10 + depth * 16 }}
          draggable
          onDragStart={(e) => e.dataTransfer.setData(DRAG, item.id)}
          onDragOver={allowDrop}
          onDrop={(e) => dropOn(e, "pinned", item.id, 0)}
          onClick={() => send({ type: "toggleFolder", id: item.id })}
          onDoubleClick={(e) => (e.stopPropagation(), useUi.getState().setRenaming(item.id))}
          onContextMenu={(e) => (e.preventDefault(), send({ type: "contextMenu", id: item.id }))}
        >
          <span className="lead"><FolderIcon open={item.open} /></span>
          {renamingId === item.id ? <RenameInput id={item.id} value={item.title} /> : <span className="label">{item.title}</span>}
        </div>
        {item.open && <Tree snap={snap} parentId={item.id} depth={depth + 1} />}
      </div>
    ),
  );
}

/** Poignée de redimensionnement : le main remonte la vue chrome au premier plan le temps du geste. */
function ResizeHandle({ width }: { width: number }) {
  const start = useRef<{ x: number; w: number } | null>(null);
  const move = (e: PointerEvent, phase: "move" | "end") => {
    const s = start.current;
    if (!s) return;
    send({ type: "resizeSidebar", phase, width: s.w + e.clientX - s.x });
    if (phase === "end") (start.current = null, document.body.classList.remove("resizing"));
  };
  return (
    <div
      className="resize-handle"
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        start.current = { x: e.clientX, w: width };
        document.body.classList.add("resizing");
        send({ type: "resizeSidebar", phase: "start", width });
      }}
      onPointerMove={(e) => move(e, "move")}
      onPointerUp={(e) => move(e, "end")}
      onPointerCancel={(e) => move(e, "end")}
      onDoubleClick={() => send({ type: "resizeSidebar", phase: "end", width: 300 })}
    />
  );
}

function ExtIcon({ icon, name }: { icon: string | null; name: string }) {
  return icon ? <img src={icon} alt="" width={16} height={16} /> : <span className="ext-letter">{name.slice(0, 1)}</span>;
}

export function Sidebar() {
  const snap = useUi((s) => s.snap);
  const wheel = useRef({ x: 0, last: 0, blockedUntil: 0 });
  const [hoverSpace, setHoverSpace] = useState<string | null>(null);
  const [extMenu, setExtMenu] = useState(false);
  // La popup s’ouvre sous l’élément cliqué, à droite de la sidebar si la place manque dedans.
  const openExt = (id: string, el: HTMLElement) => {
    const r = el.getBoundingClientRect();
    setExtMenu(false);
    send({ type: "openExtension", id, x: Math.round(r.left), y: Math.round(r.bottom + 6) });
  };
  const space = snap ? (snap.state.spaces.find((s) => s.id === snap.state.activeSpaceId) ?? snap.state.spaces[0]) : undefined;
  useSpaceTheme(space);
  if (!snap || !space) return null;
  const { state } = snap;
  const width = state.settings.sidebarWidth;
  const active = state.items.find((i): i is TabItem => i.kind === "tab" && i.id === state.activeTabBySpace[state.activeSpaceId]);
  const rt = active ? snap.runtime[active.id] : undefined;
  const favorites = children(snap, "favorites", null).filter((i): i is TabItem => i.kind === "tab");
  const today = children(snap, "today", null).filter((i): i is TabItem => i.kind === "tab");
  const host = hostLabel(active?.url);

  const onWheel = (e: React.WheelEvent) => {
    if (Math.abs(e.deltaX) < Math.abs(e.deltaY)) return;
    const w = wheel.current;
    const now = Date.now();
    // L’inertie du trackpad continue après la bascule : on l’ignore pour ne pas sauter plusieurs Spaces.
    if (now < w.blockedUntil) return;
    if (now - w.last > 400) w.x = 0;
    w.last = now;
    w.x += e.deltaX;
    if (Math.abs(w.x) > 120) {
      send({ type: "switchSpaceRelative", delta: w.x > 0 ? 1 : -1 });
      w.x = 0;
      w.blockedUntil = now + 600;
    }
  };

  return (
    <div className={`chrome ${snap.sidebarFloating ? "is-floating" : ""}`}>
      {!snap.sidebarVisible && !snap.sidebarFloating && (
        <div className="edge-hotzone" data-testid="edge-hotzone" onMouseEnter={() => send({ type: "floatSidebar", show: true })} />
      )}
      {(snap.sidebarVisible || snap.sidebarFloating) && (
        <aside
          className={`sidebar ${snap.sidebarFloating ? "floating" : ""}`}
          style={{ width }}
          onWheel={onWheel}
          data-testid="sidebar"
        >
          <div className="topbar">
            <button className="icon" title="Masquer la sidebar (⌘S)" onClick={() => send({ type: "action", action: "toggleSidebar" })}>
              <Icon name="sidebar" />
            </button>
            <span className="grow" />
            {snap.extensions.filter((x) => x.pinned).map((x) => (
              <button key={x.id} className="icon ext" title={x.name} data-testid={`ext-${x.id}`} onClick={(e) => openExt(x.id, e.currentTarget)}>
                <ExtIcon icon={x.icon} name={x.name} />
              </button>
            ))}
            {snap.extensions.length > 0 && (
              <button className={`icon puzzle ${extMenu ? "on" : ""}`} title="Extensions" data-testid="ext-menu-button" onClick={() => setExtMenu((v) => !v)}>
                <Icon name="puzzle" />
              </button>
            )}
            <button className="icon" disabled={!rt?.canGoBack} title="Précédent (⌘[)" onClick={() => send({ type: "back" })}><Icon name="back" /></button>
            <button className="icon" disabled={!rt?.canGoForward} title="Suivant (⌘])" onClick={() => send({ type: "forward" })}><Icon name="forward" /></button>
            <button className="icon" disabled={!active} title="Recharger (⌘R)" onClick={() => send({ type: "reload" })}><Icon name="reload" /></button>
          </div>

          <button
            className="urlbar"
            data-testid="urlbar"
            title={active?.url}
            onClick={() => send({ type: "openOverlay", view: { kind: "command", initial: active?.url ?? "", replaceCurrent: !!active } })}
          >
            {host ? (
              <span className="url-host">{host}</span>
            ) : (
              <span className="url-placeholder"><Icon name="search" size={13} /> Rechercher ou saisir une URL</span>
            )}
          </button>

          {extMenu && (
            <>
              <div className="ext-menu-backdrop" onClick={() => setExtMenu(false)} />
              <div className="ext-menu" data-testid="ext-menu" onKeyDown={(e) => e.key === "Escape" && setExtMenu(false)}>
                <div className="ext-menu-title">Extensions</div>
                {snap.extensions.map((x) => (
                  <div key={x.id} className="ext-menu-row">
                    <button className="ext-menu-open" data-testid={`ext-open-${x.id}`} onClick={(e) => openExt(x.id, e.currentTarget)}>
                      <ExtIcon icon={x.icon} name={x.name} />
                      <span className="label">{x.name}</span>
                    </button>
                    <button
                      className={`icon ext-pin ${x.pinned ? "on" : ""}`}
                      title={x.pinned ? "Retirer de la barre" : "Épingler dans la barre"}
                      data-testid={`ext-pin-${x.id}`}
                      onClick={() => send({ type: "pinExtension", id: x.id, pinned: !x.pinned })}
                    >
                      <Icon name="pin" size={13} />
                    </button>
                  </div>
                ))}
              </div>
            </>
          )}

          <div
            className="favorites"
            style={{ gridTemplateColumns: `repeat(${favColumns(favorites.length)}, 1fr)` }}
            onDragOver={allowDrop}
            onDrop={(e) => dropOn(e, "favorites", null, 1e9)}
            data-testid="favorites"
          >
            {favorites.map((f, i) => (
              <button
                key={f.id}
                className={`fav ${state.activeTabBySpace[state.activeSpaceId] === f.id ? "active" : ""}`}
                title={displayTitle(f)}
                draggable
                onDragStart={(e) => e.dataTransfer.setData(DRAG, f.id)}
                onDragOver={allowDrop}
                onDrop={(e) => dropOn(e, "favorites", null, i)}
                onClick={() => send({ type: "activateTab", id: f.id })}
                onContextMenu={(e) => (e.preventDefault(), send({ type: "contextMenu", id: f.id }))}
              >
                <Favicon src={faviconFor(snap, f.url)} title={displayTitle(f)} />
                {snap.runtime[f.id]?.audible && <span className="fav-audio"><Icon name="speaker" size={10} /></span>}
              </button>
            ))}
            {favorites.length === 0 && <div className="hint">Glisse un onglet ici pour l’ajouter aux favoris</div>}
          </div>

          <div className="space-header" onContextMenu={(e) => (e.preventDefault(), send({ type: "spaceMenu", spaceId: space.id }))}>
            {space.icon && <span className="space-icon">{space.icon}</span>}
            <span className="label" data-testid="space-title" onDoubleClick={() => send({ type: "openOverlay", view: { kind: "space", spaceId: space.id } })}>{space.title}</span>
            <button className="icon small reveal" title="Nouveau dossier" onClick={() => send({ type: "newFolder", parentId: null })}><Icon name="folderAdd" size={14} /></button>
            <button className="icon small reveal" title="Options du Space" onClick={() => send({ type: "spaceMenu", spaceId: space.id })}><Icon name="more" size={14} /></button>
          </div>

          <div className="scroll">
            <section className="pinned" onDragOver={allowDrop} onDrop={(e) => dropOn(e, "pinned", null, 1e9)} data-testid="pinned">
              <Tree snap={snap} parentId={null} depth={0} />
              {children(snap, "pinned", null).length === 0 && <div className="hint">Épingle un onglet (⌘D) pour le garder ici</div>}
            </section>

            <div className="today-divider" onDragOver={allowDrop} onDrop={(e) => dropOn(e, "today", null, 1e9)}>
              <span className="line" />
              <button className="clear" title="Vider Today (⇧⌘K)" onClick={() => send({ type: "clearToday" })} data-testid="clear-today">
                <Icon name="back" size={11} /> Vider
              </button>
            </div>

            <div className="row new-tab" onClick={() => send({ type: "newTab" })} data-testid="new-tab">
              <span className="lead"><Icon name="plus" size={15} /></span>
              <span className="label">Nouvel onglet</span>
            </div>
            <section onDragOver={allowDrop} onDrop={(e) => dropOn(e, "today", null, 1e9)} data-testid="today">
              {[...today].reverse().map((t) => (
                <TabRow key={t.id} snap={snap} tab={t} depth={0} index={today.indexOf(t)} />
              ))}
            </section>
          </div>

          {snap.toast && <div className="toast" data-testid="toast">{snap.toast.text}</div>}

          <footer className="bottombar">
            <button className="icon" title="Onglets archivés" onClick={() => send({ type: "action", action: "archive" })}><Icon name="archive" /></button>
            <div className="spaces" data-testid="space-dots">
              {state.spaces.map((sp, i) => (
                <button
                  key={sp.id}
                  className={`dot ${sp.id === state.activeSpaceId ? "active" : ""} ${hoverSpace === sp.id ? "drop" : ""}`}
                  title={`${sp.title}${i < 9 ? ` (⌃${i + 1})` : ""}`}
                  onClick={() => send({ type: "switchSpace", spaceId: sp.id })}
                  onContextMenu={(e) => (e.preventDefault(), send({ type: "spaceMenu", spaceId: sp.id }))}
                  onDragOver={(e) => (allowDrop(e), setHoverSpace(sp.id))}
                  onDragLeave={() => setHoverSpace(null)}
                  onDrop={(e) => {
                    const id = e.dataTransfer.getData(DRAG);
                    setHoverSpace(null);
                    if (id) send({ type: "move", id, to: { zone: "today", parentId: null, index: 1e9, spaceId: sp.id } });
                  }}
                >
                  {sp.icon || <span className="swatch" style={{ background: sp.color ?? "currentColor" }} />}
                </button>
              ))}
            </div>
            <button className="icon dot add" title="Nouveau Space" onClick={() => send({ type: "openOverlay", view: { kind: "space", spaceId: null } })}><Icon name="plus" /></button>
          </footer>
          {!snap.sidebarFloating && <ResizeHandle width={width} />}
        </aside>
      )}
      {!active && (
        <main className="empty" style={{ left: snap.sidebarVisible ? width : PAD }}>
          <div>
            <svg className="empty-logo" width="56" height="56" viewBox="0 0 56 56" aria-hidden>
              <path d="M8 40c6-18 16-27 20-27s14 9 20 27" fill="none" stroke="var(--accent)" strokeWidth="7" strokeLinecap="round" />
            </svg>
            <p>
              <kbd>⌘T</kbd> nouvel onglet · <kbd>⌘L</kbd> Command Bar · <kbd>⌃1…9</kbd> Spaces
            </p>
            {!snap.sidebarVisible && <button className="ghost" onClick={() => send({ type: "action", action: "toggleSidebar" })}>Afficher la sidebar</button>}
          </div>
        </main>
      )}
    </div>
  );
}
