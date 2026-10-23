import { app, BaseWindow, clipboard, dialog, Menu, type MenuItemConstructorOptions, nativeTheme, screen, session, shell, WebContentsView, type WebContents } from "electron";
import { createHash, randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, parse } from "node:path";
import { importArcSidebar, type ArcImport } from "../core/arcImport";
import { sidebarEdge } from "../core/edge";
import { spaceTheme } from "../core/theme";
import { routeUrl } from "../core/atc";
import { searchCommandBar, type CommandAction, type CommandResult } from "../core/commandBar";
import { displayTitle, isTab, type Boost, type State, type TabItem } from "../core/model";
import * as S from "../core/store";
import { hostOf, shouldPeek, toNavigableUrl } from "../core/url";
import type { ChromeCommand, DownloadEntry, OverlayView, PanelData, Snapshot, TabRuntime } from "../shared/ipc";
import { applyBoosts, AUTO_PIP_SCRIPT, capturePage, EXIT_PIP_SCRIPT, setAdblock, ZAP_SCRIPT } from "./features";
import { extensionsFor, importArcExtensions, loadAllExtensions, partitionFor, pinExtension, pinnedFor } from "./extensions";
import { LittleWindow } from "./little";
import { arcSidebarPath, debounce, loadState, readJson, writeJson } from "./persist";

const PAD = 10;
const GAP = 8;
const ids = () => randomUUID();
const NEW_TAB_URL = "https://www.google.com/";

export class Bowvane {
  state: State;
  private favicons: Record<string, string> = readJson<Record<string, string>>("favicons.json") ?? {};
  private views = new Map<string, WebContentsView>();
  private runtime = new Map<string, TabRuntime>();
  private splits = new Map<string, { primary: string; secondary: string }>();
  private sidebarVisible = true;
  private sidebarFloating = false;
  private overlayView: OverlayView = { kind: "none" };
  private overlaySeq = 0;
  private toast: Snapshot["toast"] = null;
  private littles = new Set<LittleWindow>();
  private downloads: DownloadEntry[] = [];
  private sessions = new Map<string, Electron.Session>();
  private peekView: WebContentsView | null = null;
  readonly win: BaseWindow;
  private chrome: WebContentsView;
  private overlay: WebContentsView;
  private readonly save = debounce(() => writeJson("state.json", this.state), 400);
  private readonly saveIcons = debounce(() => writeJson("favicons.json", this.favicons), 2000);
  private readonly pushSoon = debounce(() => this.push(), 16);

  constructor(private rendererUrl: (view: string) => string) {
    const loaded = loadState();
    let firstImport: string | null = null;
    if (loaded) {
      const arc = arcSidebarPath();
      let state = loaded;
      if (arc && loaded.spaces.some((sp) => sp.appearance === undefined)) {
        try {
          const r = importArcSidebar(JSON.parse(readFileSync(arc, "utf8")), Date.now(), ids);
          state = S.adoptArcThemes(loaded, r.state.spaces);
          this.importArcFavicons(arc, r.faviconHints);
        } catch (e) {
          console.error(e);
        }
      }
      this.state = S.migrate(state);
      this.save();
    }
    else {
      const arc = arcSidebarPath();
      if (arc) {
        try {
          const r = importArcSidebar(JSON.parse(readFileSync(arc, "utf8")), Date.now(), ids);
          this.state = r.state;
          this.importArcFavicons(arc, r.faviconHints);
          firstImport = `Arc importé : ${r.report.spaces} Spaces, ${r.report.pinnedTabs} onglets épinglés, ${r.report.favorites} favoris`;
        } catch (e) {
          console.error(e);
          this.state = S.emptyState(ids);
        }
      } else this.state = S.emptyState(ids);
      this.save();
    }

    this.win = new BaseWindow({ width: 1440, height: 900, minWidth: 640, minHeight: 420, titleBarStyle: "hidden", trafficLightPosition: { x: 14, y: 16 }, backgroundColor: this.background(), title: "Bowvane" });
    const prefs = { preload: join(__dirname, "../preload/chrome.cjs"), sandbox: true, contextIsolation: true };
    this.chrome = new WebContentsView({ webPreferences: prefs });
    this.overlay = new WebContentsView({ webPreferences: prefs });
    this.overlay.setBackgroundColor("#00000000");
    this.chrome.setBackgroundColor("#00000000");
    this.win.contentView.addChildView(this.chrome);
    this.chrome.webContents.loadURL(this.rendererUrl("sidebar"));
    this.overlay.webContents.loadURL(this.rendererUrl("overlay"));
    this.chrome.webContents.on("did-finish-load", () => this.push());
    this.overlay.webContents.on("did-finish-load", () => this.push());
    this.win.on("resize", () => this.layout());
    this.win.on("closed", () => app.quit());
    nativeTheme.on("updated", () => this.push());
    this.overlay.webContents.on("before-input-event", (e, input) => {
      if (input.type === "keyDown" && input.key === "Escape") {
        e.preventDefault();
        this.closeOverlay();
      }
    });

    setInterval(() => this.autoArchive(), 60_000);
    setInterval(() => this.watchEdge(), 40);
    this.autoArchive();
    const active = this.activeTab();
    if (active) this.activate(active.id);
    else this.layout();
    if (firstImport) this.notify(firstImport);
  }

  /** Écrit l’état tout de suite (fermeture de l’app) au lieu d’attendre l’écriture différée. */
  flush(): void {
    writeJson("state.json", this.state);
    writeJson("favicons.json", this.favicons);
  }

  // ——— lecture de l’état ———
  /** Sidebar flottante : la vue chrome passe devant les pages tant qu’elle est affichée. */
  private setFloating(show: boolean): void {
    if (show === this.sidebarFloating) return;
    this.sidebarFloating = show;
    this.win.contentView.removeChildView(this.chrome);
    // Sans index pour passer devant : un index « undefined » explicite place la vue tout en bas.
    if (show) this.win.contentView.addChildView(this.chrome);
    else this.win.contentView.addChildView(this.chrome, 0);
    // L’overlay ouvert doit rester au-dessus de tout.
    if (this.overlayView.kind !== "none") this.layout();
  }

  private lastCursor = { x: NaN, y: NaN };
  private closeAt = 0;
  /**
   * Sidebar repliée : le pointeur est suivi à l’écran plutôt que par une zone HTML de 10 px,
   * que le redimensionnement de la fenêtre par macOS rognait. Seuls les mouvements comptent,
   * et la fermeture attend un court instant pour ne pas clignoter au bord du panneau.
   */
  private watchEdge(): void {
    if (this.win.isDestroyed() || this.sidebarVisible || this.overlayView.kind !== "none" || !this.win.isFocused()) {
      this.closeAt = 0;
      return;
    }
    const cursor = screen.getCursorScreenPoint();
    const moved = cursor.x !== this.lastCursor.x || cursor.y !== this.lastCursor.y;
    this.lastCursor = cursor;
    if (moved) {
      const decision = sidebarEdge(cursor, this.win.getContentBounds(), this.state.settings.sidebarWidth, this.sidebarFloating);
      if (decision === "open") {
        this.setFloating(true);
        this.push();
      }
      if (decision === "close") this.closeAt ||= Date.now() + 250;
      else this.closeAt = 0;
    }
    if (this.closeAt && Date.now() >= this.closeAt) {
      this.closeAt = 0;
      this.setFloating(false);
      this.push();
    }
  }

  /** Couleur de fond effective du Space actif (thème clair, sombre ou système). */
  private background(): string {
    return spaceTheme(this.space(), nativeTheme.shouldUseDarkColors).background;
  }

  /** Reprend les favicons du cache d’Arc (PNG nommés par le MD5 de l’identifiant de l’élément). */
  private importArcFavicons(arcPath: string, hints: ArcImport["faviconHints"]): number {
    const dir = join(dirname(arcPath), "SidebarItemsFaviconCache");
    if (!existsSync(dir)) return 0;
    let n = 0;
    for (const { url, arcId } of hints) {
      const host = hostOf(url);
      if (!host || this.favicons[host]) continue;
      const f = join(dir, createHash("md5").update(arcId).digest("hex"));
      if (!existsSync(f)) continue;
      try {
        this.favicons[host] = `data:image/png;base64,${readFileSync(f).toString("base64")}`;
        n++;
      } catch {
        /* fichier illisible : la lettre de repli s’affichera */
      }
    }
    if (n) this.saveIcons();
    return n;
  }

  private space() {
    return this.state.spaces.find((s) => s.id === this.state.activeSpaceId) ?? this.state.spaces[0]!;
  }
  private tab(id: string | null | undefined): TabItem | undefined {
    const t = this.state.items.find((i) => i.id === id);
    return isTab(t) ? t : undefined;
  }
  activeTab(): TabItem | undefined {
    return this.tab(this.state.activeTabBySpace[this.state.activeSpaceId]);
  }
  private activeContents(): WebContents | undefined {
    const t = this.activeTab();
    return t ? this.views.get(t.id)?.webContents : undefined;
  }
  private profileOf(t: TabItem): string {
    const sp = this.state.spaces.find((s) => s.id === (t.spaceId ?? this.state.activeSpaceId));
    return sp?.profile ?? "default";
  }

  private commit(next: State): void {
    if (next === this.state) return;
    this.state = next;
    this.save();
    this.pushSoon();
  }

  // ——— sessions (un profil = une partition) ———
  sessionFor(profile: string): Electron.Session {
    let ses = this.sessions.get(profile);
    if (ses) return ses;
    ses = session.fromPartition(partitionFor(profile));
    ses.setUserAgent(app.userAgentFallback);
    void setAdblock(ses, this.state.settings.adblock, app.getPath("userData"));
    ses.on("will-download", (_e, item) => this.trackDownload(item));
    this.sessions.set(profile, ses);
    return ses;
  }

  // ——— vues d’onglets ———
  private rt(id: string): TabRuntime {
    let r = this.runtime.get(id);
    if (!r) {
      r = { loaded: false, loading: false, audible: false, muted: false, canGoBack: false, canGoForward: false };
      this.runtime.set(id, r);
    }
    return r;
  }

  private ensureView(t: TabItem): WebContentsView {
    const existing = this.views.get(t.id);
    if (existing) return existing;
    const view = new WebContentsView({ webPreferences: { session: this.sessionFor(this.profileOf(t)), sandbox: true, contextIsolation: true } });
    view.setBackgroundColor("#ffffff");
    view.setBorderRadius(10);
    this.views.set(t.id, view);
    this.win.contentView.addChildView(view, 1);
    const wc = view.webContents;
    const id = t.id;
    const r = this.rt(id);
    r.loaded = true;
    const nav = () => {
      r.canGoBack = wc.navigationHistory.canGoBack();
      r.canGoForward = wc.navigationHistory.canGoForward();
      this.commit(S.recordVisit(this.state, id, wc.getURL(), wc.getTitle(), Date.now()));
      this.pushSoon();
    };
    wc.on("did-navigate", nav);
    wc.on("did-navigate-in-page", (_e, _url, isMain) => isMain && nav());
    wc.on("page-title-updated", (_e, title) => this.commit(S.updateTitle(this.state, id, title)));
    wc.on("page-favicon-updated", (_e, icons) => {
      const host = hostOf(wc.getURL());
      if (host && icons[0] && this.favicons[host] !== icons[0]) {
        this.favicons[host] = icons[0];
        this.saveIcons();
        this.pushSoon();
      }
    });
    wc.on("did-start-loading", () => ((r.loading = true), this.pushSoon()));
    wc.on("did-stop-loading", () => ((r.loading = false), this.pushSoon()));
    wc.on("audio-state-changed", (e) => ((r.audible = e.audible), this.pushSoon()));
    wc.on("dom-ready", () => void applyBoosts(wc, this.state.boosts));
    wc.on("found-in-page", (_e, res) => this.overlay.webContents.send("findResult", { active: res.activeMatchOrdinal, total: res.matches }));
    wc.on("context-menu", (_e, p) => this.pageMenu(wc, p));
    wc.on("before-input-event", (e, input) => {
      if (input.type === "keyDown" && input.key === "Escape" && this.overlayView.kind === "find") {
        e.preventDefault();
        this.closeOverlay();
      }
      // ⌘S passe avant la page : beaucoup de sites l’interceptent (« enregistrer ») et la sidebar resterait cachée.
      if (input.type === "keyDown" && input.meta && !input.shift && !input.alt && !input.control && input.key.toLowerCase() === "s") {
        e.preventDefault();
        this.action("toggleSidebar");
      }
    });
    wc.setWindowOpenHandler(({ url, disposition, features }) => {
      const owner = this.tab(id);
      const spaceId = owner?.spaceId ?? this.state.activeSpaceId;
      // Fenêtre ouverte avec des dimensions (connexion OAuth…) : vraie popup, pour garder window.opener.
      if (features) return { action: "allow" };
      this.openInSpace(spaceId, url, disposition !== "background-tab");
      return { action: "deny" };
    });
    wc.on("will-navigate", (e) => {
      const owner = this.tab(id);
      if (!owner || owner.zone !== "favorites" || !owner.pinnedUrl) return;
      if (shouldPeek(owner.pinnedUrl, e.url)) {
        e.preventDefault();
        this.openPeek(e.url);
      }
    });
    wc.on("render-process-gone", () => {
      this.views.delete(id);
      r.loaded = false;
      this.pushSoon();
    });
    wc.loadURL(t.url).catch(() => undefined);
    return view;
  }

  private destroyView(id: string): void {
    const view = this.views.get(id);
    if (view) {
      this.win.contentView.removeChildView(view);
      if (!view.webContents.isDestroyed()) view.webContents.close();
      this.views.delete(id);
    }
    this.runtime.delete(id);
    for (const [sp, split] of this.splits) if (split.primary === id || split.secondary === id) this.splits.delete(sp);
  }

  private syncViewsWithState(): void {
    const live = new Set(this.state.items.map((i) => i.id));
    for (const id of [...this.views.keys()]) if (!live.has(id)) this.destroyView(id);
  }

  // ——— mise en page ———
  layout(): void {
    const { width, height } = this.win.getContentBounds();
    this.chrome.setBounds({ x: 0, y: 0, width, height });
    const x = this.sidebarVisible ? this.state.settings.sidebarWidth : PAD;
    const area = { x, y: PAD, width: Math.max(100, width - x - PAD), height: Math.max(100, height - 2 * PAD) };
    const active = this.activeTab();
    const split = this.splits.get(this.state.activeSpaceId);
    const shown = new Map<string, Electron.Rectangle>();
    if (active && split && (split.primary === active.id || split.secondary === active.id) && this.views.has(split.secondary) && this.views.has(split.primary)) {
      const half = Math.floor((area.width - GAP) / 2);
      shown.set(split.primary, { ...area, width: half });
      shown.set(split.secondary, { ...area, x: area.x + half + GAP, width: area.width - half - GAP });
    } else if (active && this.views.has(active.id)) shown.set(active.id, area);
    for (const [id, view] of this.views) {
      const b = shown.get(id);
      view.setVisible(!!b);
      if (b) view.setBounds(b);
    }
    const o = this.overlayView;
    if (o.kind === "none") this.win.contentView.removeChildView(this.overlay);
    else {
      this.win.contentView.addChildView(this.overlay);
      this.overlay.setBounds(o.kind === "find" ? { x: area.x + area.width - 380, y: area.y + 8, width: 372, height: 52 } : { x: 0, y: 0, width, height });
      if (this.peekView && o.kind === "peek") {
        this.win.contentView.addChildView(this.peekView);
        this.peekView.setBounds({ x: area.x + 48, y: area.y + 52, width: area.width - 96, height: area.height - 72 });
      }
    }
  }

  // ——— diffusion vers l’interface ———
  /** Épinglées d’abord, dans l’ordre de la barre ; le reste par nom, comme le menu puzzle d’Arc. */
  private extensionList(): Snapshot["extensions"] {
    const profile = this.space().profile;
    const pinned = pinnedFor(profile);
    const rank = (id: string) => (pinned.includes(id) ? pinned.indexOf(id) : pinned.length);
    return extensionsFor(profile)
      .sort((a, b) => rank(a.folder) - rank(b.folder) || a.name.localeCompare(b.name))
      .map((e) => ({ id: e.id, name: e.name, icon: e.iconData, hasPopup: !!e.popup, pinned: pinned.includes(e.folder) }));
  }

  snapshot(): Snapshot {
    const { spaces, activeSpaceId, items, activeTabBySpace, rules, boosts, settings } = this.state;
    return {
      state: { spaces, activeSpaceId, items, activeTabBySpace, rules, boosts, settings },
      runtime: Object.fromEntries(this.runtime),
      favicons: this.favicons,
      split: this.splits.get(activeSpaceId) ?? null,
      sidebarVisible: this.sidebarVisible,
      sidebarFloating: this.sidebarFloating,
      overlay: this.overlayView,
      overlaySeq: this.overlaySeq,
      toast: this.toast,
      arcAvailable: !!arcSidebarPath(),
      extensions: this.extensionList(),
    };
  }

  push(): void {
    const snap = this.snapshot();
    this.win.setBackgroundColor(this.background());
    for (const v of [this.chrome, this.overlay]) if (!v.webContents.isDestroyed()) v.webContents.send("snapshot", snap);
    for (const l of this.littles) l.push();
  }

  notify(text: string): void {
    const id = Date.now();
    this.toast = { id, text };
    this.pushSoon();
    setTimeout(() => {
      if (this.toast?.id === id) {
        this.toast = null;
        this.pushSoon();
      }
    }, 3000);
  }

  // ——— onglets ———
  activate(id: string): void {
    const t = this.tab(id);
    if (!t) return;
    const prev = this.activeContents();
    const split = this.splits.get(t.spaceId ?? this.state.activeSpaceId);
    const stayingInSplit = split && (split.primary === id || split.secondary === id);
    if (prev && !stayingInSplit && prev !== this.views.get(id)?.webContents && this.runtime.get(this.activeTab()?.id ?? "")?.audible) {
      void prev.executeJavaScript(AUTO_PIP_SCRIPT, true).catch(() => undefined);
    }
    this.commit(S.setActiveTab(this.state, id, Date.now()));
    const view = this.ensureView(t);
    void view.webContents.executeJavaScript(EXIT_PIP_SCRIPT, true).catch(() => undefined);
    this.layout();
    if (this.overlayView.kind === "none") view.webContents.focus();
    this.pushSoon();
  }

  openInSpace(spaceId: string, url: string, focus = true): string {
    const next = S.newTab(this.state, ids, spaceId, url, Date.now());
    const id = next.items.at(-1)!.id;
    this.commit(next);
    if (focus) {
      if (spaceId !== this.state.activeSpaceId) this.commit(S.setActiveSpace(this.state, spaceId));
      this.activate(id);
    } else {
      this.ensureView(this.tab(id)!);
      this.layout();
    }
    return id;
  }

  newTabFromInput(input: string): void {
    this.openInSpace(this.state.activeSpaceId, toNavigableUrl(input, this.state.settings.searchEngine));
  }

  close(id: string): void {
    const t = this.tab(id);
    if (!t) return;
    const wasActive = this.activeTab()?.id === id;
    const { state, unloadOnly } = S.closeTab(this.state, id, Date.now());
    this.commit(state);
    this.destroyView(id);
    if (unloadOnly) this.rt(id);
    if (wasActive) {
      const candidates = this.state.items
        .filter((i): i is TabItem => isTab(i) && i.id !== id && (i.spaceId === this.state.activeSpaceId || i.spaceId === null) && this.views.has(i.id))
        .sort((a, b) => b.lastActiveAt - a.lastActiveAt);
      if (candidates[0]) this.activate(candidates[0].id);
      else this.commit(S.setActiveTab(this.state, null, Date.now()));
    }
    this.layout();
    this.pushSoon();
  }

  closeActive(): void {
    const t = this.activeTab();
    if (t) this.close(t.id);
  }

  switchSpace(spaceId: string): void {
    if (spaceId === this.state.activeSpaceId) return;
    const prev = this.activeContents();
    if (prev && this.runtime.get(this.activeTab()?.id ?? "")?.audible) void prev.executeJavaScript(AUTO_PIP_SCRIPT, true).catch(() => undefined);
    this.commit(S.setActiveSpace(this.state, spaceId));
    const t = this.activeTab();
    if (t) this.activate(t.id);
    else this.layout();
    this.pushSoon();
  }

  switchSpaceRelative(delta: 1 | -1): void {
    const list = this.state.spaces;
    const i = list.findIndex((s) => s.id === this.state.activeSpaceId);
    const next = list[(i + delta + list.length) % list.length];
    if (next) this.switchSpace(next.id);
  }

  switchSpaceIndex(index: number): void {
    const sp = this.state.spaces[index];
    if (sp) this.switchSpace(sp.id);
  }

  cycleTab(delta: 1 | -1): void {
    const order = this.visibleOrder();
    if (!order.length) return;
    const i = order.indexOf(this.activeTab()?.id ?? "");
    const next = order[(i + delta + order.length) % order.length];
    if (next) this.activate(next);
  }

  /** Ordre visuel des onglets : Favorites, épinglés (dossiers ouverts), puis Today du plus récent au plus ancien. */
  private visibleOrder(): string[] {
    const s = this.state;
    const out: string[] = S.childrenOf(s, null, "favorites", null).map((i) => i.id);
    const walk = (parent: string | null) => {
      for (const i of S.childrenOf(s, s.activeSpaceId, "pinned", parent)) {
        if (i.kind === "tab") out.push(i.id);
        else if (i.open) walk(i.id);
      }
    };
    walk(null);
    out.push(...S.childrenOf(s, s.activeSpaceId, "today", null).map((i) => i.id).reverse());
    return out;
  }

  restoreClosed(): void {
    const { state, restoredId } = S.restoreClosed(this.state, ids, Date.now());
    this.commit(state);
    if (restoredId) this.activate(restoredId);
  }

  private autoArchive(): void {
    const next = S.archiveStale(this.state, Date.now());
    if (next !== this.state) {
      this.commit(next);
      this.syncViewsWithState();
      this.layout();
    }
  }

  // ——— Split View ———
  addSplit(secondaryId?: string): void {
    const active = this.activeTab();
    if (!active) return;
    let other = secondaryId && secondaryId !== active.id ? this.tab(secondaryId) : undefined;
    if (!other) {
      const id = this.openInSpace(this.state.activeSpaceId, NEW_TAB_URL, false);
      other = this.tab(id);
    }
    if (!other) return;
    this.ensureView(other);
    this.splits.set(this.state.activeSpaceId, { primary: active.id, secondary: other.id });
    this.activate(other.id);
    if (!secondaryId) this.openOverlay({ kind: "command", initial: "", replaceCurrent: true });
  }

  closeSplitPane(): void {
    const split = this.splits.get(this.state.activeSpaceId);
    if (!split) return;
    this.splits.delete(this.state.activeSpaceId);
    const active = this.activeTab()?.id;
    this.activate(active === split.secondary ? split.primary : split.secondary);
  }

  // ——— Peek ———
  openPeek(url: string): void {
    if (!this.peekView) {
      this.peekView = new WebContentsView({ webPreferences: { session: this.sessionFor(this.space().profile), sandbox: true, contextIsolation: true } });
      this.peekView.setBorderRadius(12);
      this.peekView.setBackgroundColor("#ffffff");
      this.peekView.webContents.setWindowOpenHandler(({ url: u }) => (this.peekView?.webContents.loadURL(u), { action: "deny" }));
    }
    this.peekView.webContents.loadURL(url).catch(() => undefined);
    this.openOverlay({ kind: "peek", url });
    this.peekView.webContents.focus();
  }

  private closePeek(): string | null {
    if (!this.peekView) return null;
    const url = this.peekView.webContents.getURL();
    this.win.contentView.removeChildView(this.peekView);
    this.peekView.webContents.close();
    this.peekView = null;
    return url;
  }

  // ——— overlay (Command Bar, panneaux) ———
  openOverlay(view: OverlayView): void {
    if (this.overlayView.kind === "peek" && view.kind !== "peek") this.closePeek();
    this.overlayView = view;
    this.overlaySeq++;
    this.layout();
    this.overlay.webContents.focus();
    this.push();
  }

  closeOverlay(): void {
    if (this.overlayView.kind === "find") this.activeContents()?.stopFindInPage("clearSelection");
    if (this.overlayView.kind === "peek") this.closePeek();
    this.overlayView = { kind: "none" };
    this.layout();
    this.activeContents()?.focus();
    this.push();
  }

  commandResults(query: string): CommandResult[] {
    const spaces = new Map(this.state.spaces.map((s) => [s.id, s.title]));
    const tabs = this.state.items
      .filter((i): i is TabItem => isTab(i))
      .sort((a, b) => b.lastActiveAt - a.lastActiveAt)
      .map((t) => ({ id: t.id, title: displayTitle(t), url: t.url, spaceTitle: t.spaceId ? (spaces.get(t.spaceId) ?? "") : "Favori" }));
    return searchCommandBar(query, { tabs, history: this.state.history, engine: this.state.settings.searchEngine });
  }

  runResult(r: CommandResult, replaceCurrent: boolean): void {
    this.closeOverlay();
    if (r.kind === "switch") {
      const t = this.tab(r.tabId);
      if (t?.spaceId && t.spaceId !== this.state.activeSpaceId) this.commit(S.setActiveSpace(this.state, t.spaceId));
      this.activate(r.tabId);
    } else if (r.kind === "open") {
      const wc = this.activeContents();
      if (replaceCurrent && wc) wc.loadURL(r.url).catch(() => undefined);
      else this.openInSpace(this.state.activeSpaceId, r.url);
    } else this.action(r.action);
  }

  action(a: CommandAction): void {
    const t = this.activeTab();
    const wc = this.activeContents();
    switch (a) {
      case "newSpace": return this.openOverlay({ kind: "space", spaceId: null });
      case "clearToday": return this.clearToday();
      case "split": return this.addSplit();
      case "closeSplit": return this.closeSplitPane();
      case "littleArc": return void this.openLittle("");
      case "private": return void this.openLittle("", true);
      case "copyUrl":
        if (t) clipboard.writeText(t.url), this.notify("URL copiée");
        return;
      case "copyMarkdown":
        if (t) clipboard.writeText(`[${displayTitle(t)}](${t.url})`), this.notify("Lien Markdown copié");
        return;
      case "capture":
        if (wc) void capturePage(wc, app.getPath("downloads")).then((p) => this.notify(`Capture copiée et enregistrée : ${parse(p).base}`));
        return;
      case "toggleSidebar":
        this.sidebarVisible = !this.sidebarVisible;
        this.setFloating(false);
        this.layout();
        return this.push();
      case "pin":
        if (t) this.commit(S.togglePin(this.state, t.id));
        return;
      case "duplicate":
        if (t) {
          const next = S.duplicateTab(this.state, ids, t.id, Date.now());
          this.commit(next);
          this.activate(next.items.at(-1)!.id);
        }
        return;
      case "reloadHard": return wc?.reloadIgnoringCache();
      case "muteAll": {
        const anyUnmuted = [...this.views.entries()].some(([, v]) => !v.webContents.isAudioMuted());
        for (const [id, v] of this.views) {
          v.webContents.setAudioMuted(anyUnmuted);
          this.rt(id).muted = anyUnmuted;
        }
        return this.pushSoon();
      }
      case "archive": return this.openOverlay({ kind: "archive" });
      case "history": return this.openOverlay({ kind: "history" });
      case "downloads": return this.openOverlay({ kind: "downloads" });
      case "boost": {
        const host = t ? hostOf(t.url) : "";
        if (host) this.openOverlay({ kind: "boost", host });
        return;
      }
      case "zap": return void this.zap();
      case "settings": return this.openOverlay({ kind: "settings" });
      case "importArc": return void this.importArc();
      case "devtools": return wc?.toggleDevTools();
    }
  }

  clearToday(): void {
    this.commit(S.clearToday(this.state, this.state.activeSpaceId, Date.now()));
    this.syncViewsWithState();
    this.layout();
  }

  zoom(step: -1 | 0 | 1): void {
    const wc = this.activeContents();
    if (!wc) return;
    wc.setZoomLevel(step === 0 ? 0 : Math.max(-5, Math.min(5, wc.getZoomLevel() + step * 0.5)));
  }

  findInPage(text: string, forward: boolean): void {
    const wc = this.activeContents();
    if (!wc) return;
    if (text) wc.findInPage(text, { forward, findNext: true });
    else wc.stopFindInPage("clearSelection");
  }

  // ——— Boosts et Zap ———
  boostFor(host: string): Boost {
    return this.state.boosts.find((b) => b.host === host) ?? { id: ids(), host, css: "", js: "", zapped: [], enabled: true };
  }

  saveBoost(b: Boost): void {
    const others = this.state.boosts.filter((x) => x.id !== b.id);
    this.commit({ ...this.state, boosts: [...others, b] });
    for (const v of this.views.values()) if (hostOf(v.webContents.getURL()).endsWith(b.host)) v.webContents.reload();
  }

  private async zap(): Promise<void> {
    const t = this.activeTab();
    const wc = this.activeContents();
    if (!t || !wc) return;
    this.notify("Zap : clique sur l’élément à masquer (Échap pour annuler)");
    wc.focus();
    const selector: unknown = await wc.executeJavaScript(ZAP_SCRIPT, true).catch(() => null);
    if (typeof selector !== "string" || !selector) return;
    const b = this.boostFor(hostOf(t.url));
    this.commit({ ...this.state, boosts: [...this.state.boosts.filter((x) => x.id !== b.id), { ...b, zapped: [...b.zapped, selector] }] });
    this.notify("Élément masqué sur ce site (modifiable dans Booster ce site)");
  }

  // ——— Little Arc, fenêtres privées, liens externes ———
  openLittle(url: string, isPrivate = false): LittleWindow {
    const host = {
      rendererUrl: this.rendererUrl,
      promote: (u: string) => this.openInSpace(this.state.activeSpaceId, u),
      engine: () => this.state.settings.searchEngine,
      color: () => this.background(),
      sessionFor: (p: string) => this.sessionFor(p),
      openFromPage: (u: string) => this.openInSpace(this.state.activeSpaceId, u),
    };
    const l = new LittleWindow(host, url, isPrivate);
    this.littles.add(l);
    l.win.on("closed", () => this.littles.delete(l));
    return l;
  }

  littleFor(sender: WebContents): LittleWindow | undefined {
    return [...this.littles].find((l) => l.owns(sender));
  }

  /** Lien venu d’une autre app : Air Traffic Control, sinon Little Arc ou nouvel onglet. */
  openExternal(url: string): void {
    const route = routeUrl(url, this.state.rules);
    if (route?.kind === "space" && this.state.spaces.some((s) => s.id === route.spaceId)) {
      this.openInSpace(route.spaceId, url);
      this.win.show();
      this.win.focus();
    } else if (route?.kind === "little" || (!route && this.state.settings.externalLinksInLittle)) {
      this.openLittle(url).win.focus();
    } else {
      this.openInSpace(this.state.activeSpaceId, url);
      this.win.focus();
    }
  }

  // ——— téléchargements ———
  private trackDownload(item: Electron.DownloadItem): void {
    const dir = app.getPath("downloads");
    const { name, ext } = parse(item.getFilename());
    let path = join(dir, item.getFilename());
    for (let i = 1; existsSync(path); i++) path = join(dir, `${name} (${i})${ext}`);
    item.setSavePath(path);
    const entry: DownloadEntry = { id: ids(), filename: parse(path).base, path, receivedBytes: 0, totalBytes: item.getTotalBytes(), state: "progressing" };
    this.downloads.unshift(entry);
    this.notify(`Téléchargement : ${entry.filename}`);
    item.on("updated", () => {
      entry.receivedBytes = item.getReceivedBytes();
      entry.totalBytes = item.getTotalBytes();
    });
    item.once("done", (_e, state) => {
      entry.state = state;
      entry.receivedBytes = item.getReceivedBytes();
      this.notify(state === "completed" ? `Téléchargé : ${entry.filename}` : `Échec du téléchargement : ${entry.filename}`);
    });
  }

  panelData(): PanelData {
    const o = this.overlayView;
    return {
      history: this.state.history.slice(0, 500),
      archive: this.state.archive.slice(0, 500),
      downloads: this.downloads,
      boost: o.kind === "boost" ? this.boostFor(o.host) : null,
    };
  }

  // ——— extensions ———
  private extPopup: WebContentsView | null = null;

  /** Ouvre la popup du bouton d’action sous l’icône cliquée, comme le fait Chrome. */
  openExtensionPopup(id: string, x: number, y: number): void {
    this.closeExtensionPopup();
    const profile = this.space().profile;
    const ext = extensionsFor(profile).find((e) => e.id === id);
    if (!ext) return;
    if (!ext.popup) return this.notify(`${ext.name} n’a pas de fenêtre à ouvrir`);
    const view = new WebContentsView({ webPreferences: { session: this.sessionFor(profile), sandbox: true, contextIsolation: true } });
    view.setBackgroundColor("#ffffff");
    view.setBorderRadius(10);
    const { width, height } = this.win.getContentBounds();
    const place = (w: number, h: number) => {
      const bw = Math.min(w, width - 16), bh = Math.min(h, height - y - 8);
      view.setBounds({ x: Math.max(8, Math.min(x, width - bw - 8)), y, width: bw, height: Math.max(80, bh) });
    };
    place(360, 480);
    this.win.contentView.addChildView(view);
    this.extPopup = view;
    const wc = view.webContents;
    wc.setWindowOpenHandler(({ url }) => {
      this.openInSpace(this.state.activeSpaceId, url);
      this.closeExtensionPopup();
      return { action: "deny" };
    });
    wc.on("before-input-event", (e, input) => {
      if (input.type === "keyDown" && input.key === "Escape") {
        e.preventDefault();
        this.closeExtensionPopup();
      }
    });
    wc.on("did-finish-load", () => {
      // La popup prend la taille de son contenu, dans les limites de Chrome (800 × 600).
      void wc
        .executeJavaScript("[document.documentElement.scrollWidth, document.documentElement.scrollHeight]")
        .then(([w, h]: [number, number]) => this.extPopup === view && place(Math.min(800, Math.max(160, w)), Math.min(600, Math.max(80, h))))
        .catch(() => undefined);
      wc.focus();
    });
    wc.on("blur", () => setTimeout(() => this.extPopup === view && !wc.isFocused() && this.closeExtensionPopup(), 100));
    void wc.loadURL(`chrome-extension://${id}/${ext.popup.replace(/^\//, "")}`);
  }

  closeExtensionPopup(): void {
    const view = this.extPopup;
    if (!view) return;
    this.extPopup = null;
    this.win.contentView.removeChildView(view);
    view.webContents.close();
  }

  // ——— import Arc ———
  async importArc(): Promise<void> {
    const path = arcSidebarPath();
    if (!path) return void dialog.showMessageBox(this.win, { message: "Aucune donnée Arc trouvée sur ce Mac.", detail: "Fichier attendu : ~/Library/Application Support/Arc/StorableSidebar.json" });
    const { response } = await dialog.showMessageBox(this.win, {
      type: "question",
      buttons: ["Remplacer mes Spaces", "Annuler"],
      defaultId: 0,
      cancelId: 1,
      message: "Importer la barre latérale d’Arc ?",
      detail: "Tes Spaces, onglets épinglés, dossiers et favoris actuels seront remplacés par ceux d’Arc. L’historique, les Boosts et les réglages sont gardés.",
    });
    if (response !== 0) return;
    try {
      const { state, report, faviconHints } = importArcSidebar(JSON.parse(readFileSync(path, "utf8")), Date.now(), ids);
      this.importArcFavicons(path, faviconHints);
      importArcExtensions(path);
      await loadAllExtensions();
      for (const id of [...this.views.keys()]) this.destroyView(id);
      this.splits.clear();
      this.commit({ ...state, history: this.state.history, archive: this.state.archive, rules: this.state.rules, boosts: this.state.boosts, settings: this.state.settings });
      this.layout();
      const skipped = Object.entries(report.skipped).map(([k, n]) => `${n} ${k}`).join(", ");
      this.notify(`Importé : ${report.spaces} Spaces, ${report.pinnedTabs} épinglés, ${report.folders} dossiers, ${report.favorites} favoris${skipped ? ` (ignorés : ${skipped})` : ""}`);
    } catch (e) {
      dialog.showErrorBox("Import impossible", e instanceof Error ? e.message : String(e));
    }
  }

  // ——— menus contextuels ———
  private itemMenu(id: string): void {
    const item = this.state.items.find((i) => i.id === id);
    if (!item) return;
    const moveTo: MenuItemConstructorOptions[] = this.state.spaces
      .filter((sp) => sp.id !== item.spaceId)
      .map((sp) => ({ label: `${sp.icon} ${sp.title}`.trim(), click: () => this.commit(S.moveItem(this.state, id, { zone: item.zone === "favorites" ? "today" : item.zone, parentId: null, index: 1e9, spaceId: sp.id })) }));
    const t = isTab(item) ? item : null;
    const template: MenuItemConstructorOptions[] = t
      ? [
          { label: t.zone === "today" ? "Épingler" : "Désépingler", accelerator: "CmdOrCtrl+D", click: () => this.commit(S.togglePin(this.state, id)) },
          { label: t.zone === "favorites" ? "Retirer des favoris" : "Ajouter aux favoris", click: () => this.commit(S.toggleFavorite(this.state, id)) },
          { label: "Renommer…", click: () => this.chrome.webContents.send("rename", id) },
          { type: "separator" },
          { label: "Ouvrir en Split View", enabled: this.activeTab()?.id !== id, click: () => this.addSplit(id) },
          { label: "Ouvrir dans Little Bowvane", click: () => void this.openLittle(t.url) },
          { label: "Dupliquer", click: () => (this.commit(S.duplicateTab(this.state, ids, id, Date.now())), this.activate(this.state.items.at(-1)!.id)) },
          { label: "Copier l’URL", click: () => clipboard.writeText(t.url) },
          ...(t.pinnedUrl
            ? [
                { label: "Revenir à l’URL épinglée", click: () => (this.commit(S.resetToPinnedUrl(this.state, id)), this.views.get(id)?.webContents.loadURL(t.pinnedUrl!)) },
                { label: "Remplacer l’URL épinglée par la page actuelle", click: () => this.commit(S.replacePinnedUrl(this.state, id)) },
              ]
            : []),
          { label: "Couper / remettre le son", click: () => this.toggleMute(id) },
          { label: "Déplacer vers", submenu: moveTo, enabled: moveTo.length > 0 },
          { type: "separator" },
          { label: t.zone === "today" ? "Fermer" : "Décharger", click: () => this.close(id) },
        ]
      : [
          { label: "Renommer…", click: () => this.chrome.webContents.send("rename", id) },
          { label: "Nouveau sous-dossier", click: () => this.commit(S.createFolder(this.state, ids, item.spaceId ?? this.state.activeSpaceId, id, "Nouveau dossier")) },
          { label: "Déplacer vers", submenu: moveTo, enabled: moveTo.length > 0 },
          { type: "separator" },
          { label: "Supprimer le dossier (garder les onglets)", click: () => this.commit(S.deleteFolder(this.state, id)) },
        ];
    Menu.buildFromTemplate(template).popup({ window: this.win });
  }

  private spaceMenu(spaceId: string): void {
    Menu.buildFromTemplate([
      { label: "Modifier le Space…", click: () => this.openOverlay({ kind: "space", spaceId }) },
      { label: "Vider Today", click: () => (this.switchSpace(spaceId), this.clearToday()) },
      { label: "Réinitialiser tous les onglets du Space", click: () => (this.commit(S.resetSpace(this.state, spaceId, Date.now())), this.syncViewsWithState(), this.layout()) },
      { type: "separator" },
      {
        label: "Supprimer le Space",
        enabled: this.state.spaces.length > 1,
        click: async () => {
          const { response } = await dialog.showMessageBox(this.win, { type: "warning", buttons: ["Supprimer", "Annuler"], cancelId: 1, message: "Supprimer ce Space ?", detail: "Ses onglets passent dans l’archive." });
          if (response !== 0) return;
          this.commit(S.deleteSpace(this.state, spaceId, Date.now()));
          this.syncViewsWithState();
          const t = this.activeTab();
          if (t) this.activate(t.id);
          else this.layout();
        },
      },
    ]).popup({ window: this.win });
  }

  private pageMenu(wc: WebContents, p: Electron.ContextMenuParams): void {
    const t: MenuItemConstructorOptions[] = [];
    if (p.linkURL) {
      t.push(
        { label: "Ouvrir le lien dans un nouvel onglet", click: () => this.openInSpace(this.state.activeSpaceId, p.linkURL, false) },
        { label: "Ouvrir le lien en Split View", click: () => { const id = this.openInSpace(this.state.activeSpaceId, p.linkURL, false); this.addSplit(id); } },
        { label: "Ouvrir dans Little Bowvane", click: () => void this.openLittle(p.linkURL) },
        { label: "Aperçu (Peek)", click: () => this.openPeek(p.linkURL) },
        { label: "Copier le lien", click: () => clipboard.writeText(p.linkURL) },
        { type: "separator" },
      );
    }
    if (p.hasImageContents && p.srcURL) t.push({ label: "Copier l’image", click: () => wc.copyImageAt(p.x, p.y) }, { label: "Ouvrir l’image dans un onglet", click: () => this.openInSpace(this.state.activeSpaceId, p.srcURL) }, { type: "separator" });
    if (p.selectionText.trim()) {
      const q = p.selectionText.trim().slice(0, 200);
      t.push({ label: "Copier", role: "copy" }, { label: `Rechercher « ${q.slice(0, 30)}${q.length > 30 ? "…" : ""} »`, click: () => this.openInSpace(this.state.activeSpaceId, toNavigableUrl(q, this.state.settings.searchEngine)) }, { type: "separator" });
    }
    if (p.isEditable) t.push({ role: "cut", label: "Couper" }, { role: "copy", label: "Copier" }, { role: "paste", label: "Coller" }, { type: "separator" });
    t.push(
      { label: "Précédent", enabled: wc.navigationHistory.canGoBack(), click: () => wc.navigationHistory.goBack() },
      { label: "Suivant", enabled: wc.navigationHistory.canGoForward(), click: () => wc.navigationHistory.goForward() },
      { label: "Recharger", click: () => wc.reload() },
      { type: "separator" },
      { label: "Booster ce site…", click: () => this.action("boost") },
      { label: "Zap : masquer un élément", click: () => void this.zap() },
      { label: "Inspecter l’élément", click: () => wc.inspectElement(p.x, p.y) },
    );
    Menu.buildFromTemplate(t).popup({ window: this.win });
  }

  toggleMute(id: string): void {
    const wc = this.views.get(id)?.webContents;
    if (!wc) return;
    wc.setAudioMuted(!wc.isAudioMuted());
    this.rt(id).muted = wc.isAudioMuted();
    this.pushSoon();
  }

  // ——— commandes venues de l’interface ———
  handle(c: ChromeCommand, sender: WebContents): void {
    const wc = this.activeContents();
    switch (c.type) {
      case "activateTab": return this.activate(c.id);
      case "closeTab": return this.close(c.id);
      case "newTab": return c.url ? this.newTabFromInput(c.url) : this.openOverlay({ kind: "command", initial: "", replaceCurrent: false });
      case "navigate": {
        const url = toNavigableUrl(c.input, this.state.settings.searchEngine);
        if (c.replaceCurrent && wc) void wc.loadURL(url).catch(() => undefined);
        else this.openInSpace(this.state.activeSpaceId, url);
        return this.closeOverlay();
      }
      case "back": return wc?.navigationHistory.canGoBack() ? wc.navigationHistory.goBack() : undefined;
      case "forward": return wc?.navigationHistory.canGoForward() ? wc.navigationHistory.goForward() : undefined;
      case "reload": return wc?.reload();
      case "togglePin": return this.commit(S.togglePin(this.state, c.id));
      case "toggleFavorite": return this.commit(S.toggleFavorite(this.state, c.id));
      case "rename": return this.commit(S.renameTab(this.state, c.id, c.title));
      case "move": return this.commit(S.moveItem(this.state, c.id, c.to));
      case "toggleFolder": return this.commit(S.toggleFolder(this.state, c.id));
      case "newFolder": return this.commit(S.createFolder(this.state, ids, this.state.activeSpaceId, c.parentId, "Nouveau dossier"));
      case "toggleMute": return this.toggleMute(c.id);
      case "contextMenu": return this.itemMenu(c.id);
      case "spaceMenu": return this.spaceMenu(c.spaceId);
      case "switchSpace": return this.switchSpace(c.spaceId);
      case "switchSpaceRelative": return this.switchSpaceRelative(c.delta);
      case "saveSpace": {
        if (c.spaceId) this.commit(S.updateSpace(this.state, c.spaceId, c.changes));
        else {
          const next = S.createSpace(this.state, ids, c.changes.title || "Nouveau Space", c.changes);
          const created = next.spaces.at(-1)!;
          const profile = c.changes.profile === "separate" ? `space-${created.id}` : c.changes.profile;
          this.commit(S.updateSpace(next, created.id, { profile }));
          this.switchSpace(created.id);
        }
        return this.closeOverlay();
      }
      case "clearToday": return this.clearToday();
      case "openOverlay": return this.openOverlay(c.view);
      case "closeOverlay": return this.closeOverlay();
      case "commandQuery": return sender.send("commandResults", this.commandResults(c.query));
      case "commandRun": return this.runResult(c.result, c.replaceCurrent);
      case "action": return this.action(c.action);
      case "peekExpand": {
        const url = this.closePeek();
        this.overlayView = { kind: "none" };
        if (url) this.openInSpace(this.state.activeSpaceId, url);
        return this.layout();
      }
      case "floatSidebar":
        this.setFloating(c.show && !this.sidebarVisible);
        return this.push();
      case "resizeSidebar": {
        // Pendant le glissement, la vue chrome passe devant les pages pour garder le pointeur.
        if (c.phase === "start") this.win.contentView.addChildView(this.chrome);
        const sidebarWidth = Math.round(Math.min(S.SIDEBAR_MAX, Math.max(S.SIDEBAR_MIN, c.width)));
        if (sidebarWidth !== this.state.settings.sidebarWidth) this.commit({ ...this.state, settings: { ...this.state.settings, sidebarWidth } });
        if (c.phase === "end") {
          this.win.contentView.removeChildView(this.chrome);
          this.win.contentView.addChildView(this.chrome, 0);
        }
        this.layout();
        this.push();
        return;
      }
      case "saveSettings": {
        const settings = { ...this.state.settings, ...c.settings };
        this.commit({ ...this.state, settings });
        for (const ses of this.sessions.values()) void setAdblock(ses, settings.adblock, app.getPath("userData"));
        return;
      }
      case "saveRules": return this.commit({ ...this.state, rules: c.rules });
      case "saveBoost": return this.saveBoost(c.boost);
      case "deleteBoost": return this.commit({ ...this.state, boosts: this.state.boosts.filter((b) => b.id !== c.id) });
      case "reopenArchived": {
        const { state, tabId } = S.reopenArchived(this.state, ids, c.index, Date.now());
        this.commit(state);
        this.closeOverlay();
        return tabId ? this.activate(tabId) : undefined;
      }
      case "openHistory": {
        this.closeOverlay();
        return void this.openInSpace(this.state.activeSpaceId, c.url);
      }
      case "showDownload": {
        const d = this.downloads.find((x) => x.id === c.id);
        return d ? shell.showItemInFolder(d.path) : undefined;
      }
      case "importArc": return void this.importArc();
      case "openExtension": return this.openExtensionPopup(c.id, c.x, c.y);
      case "pinExtension": {
        const ext = extensionsFor(this.space().profile).find((e) => e.id === c.id);
        if (ext) pinExtension(this.space().profile, ext.folder, c.pinned);
        return this.push();
      }
      case "littleCommand": return this.littleFor(sender)?.command(c.command);
      case "littleNavigate": return this.littleFor(sender)?.navigate(c.input);
      case "find": return this.findInPage(c.text, c.forward);
      case "findStop": return this.closeOverlay();
    }
  }
}
