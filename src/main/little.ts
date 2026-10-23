import { BaseWindow, clipboard, session, WebContentsView } from "electron";
import { join } from "node:path";
import type { LittleSnapshot } from "../shared/ipc";
import { toNavigableUrl } from "../core/url";

const BAR = 40;
let privateCount = 0;

export interface LittleHost {
  rendererUrl(view: string): string;
  promote(url: string): void;
  engine(): string;
  color(): string;
  sessionFor(profile: string): Electron.Session;
  openFromPage(url: string): void;
}

/** Little Arc (⌥⌘N) et fenêtre privée : petite fenêtre flottante, une barre et une page. */
export class LittleWindow {
  readonly win: BaseWindow;
  private bar: WebContentsView;
  private page: WebContentsView;

  constructor(private host: LittleHost, url: string, readonly isPrivate = false) {
    this.win = new BaseWindow({ width: isPrivate ? 1100 : 760, height: isPrivate ? 760 : 620, minWidth: 360, minHeight: 240, titleBarStyle: "hidden", trafficLightPosition: { x: 12, y: 13 }, backgroundColor: "#1d1d22", title: isPrivate ? "Fenêtre privée" : "Little Bowvane" });
    this.bar = new WebContentsView({ webPreferences: { preload: join(__dirname, "../preload/chrome.cjs"), sandbox: true, contextIsolation: true } });
    const ses = isPrivate ? session.fromPartition(`incognito-${++privateCount}`) : host.sessionFor("default");
    this.page = new WebContentsView({ webPreferences: { session: ses, sandbox: true, contextIsolation: true } });
    this.win.contentView.addChildView(this.bar);
    this.win.contentView.addChildView(this.page);
    this.bar.webContents.loadURL(host.rendererUrl("little"));
    this.page.webContents.setWindowOpenHandler(({ url: target }) => {
      host.openFromPage(target);
      return { action: "deny" };
    });
    const push = () => this.push();
    for (const ev of ["did-start-loading", "did-stop-loading", "page-title-updated", "did-navigate", "did-navigate-in-page"] as const) this.page.webContents.on(ev as "did-stop-loading", push);
    this.bar.webContents.on("did-finish-load", push);
    this.win.on("resize", () => this.layout());
    this.win.on("closed", () => {
      if (!this.page.webContents.isDestroyed()) this.page.webContents.close();
      if (!this.bar.webContents.isDestroyed()) this.bar.webContents.close();
    });
    this.layout();
    if (url) this.page.webContents.loadURL(url);
  }

  get pageContents(): Electron.WebContents {
    return this.page.webContents;
  }

  private layout(): void {
    const { width, height } = this.win.getContentBounds();
    this.bar.setBounds({ x: 0, y: 0, width, height: BAR });
    this.page.setBounds({ x: 6, y: BAR, width: width - 12, height: height - BAR - 6 });
  }

  push(): void {
    if (this.bar.webContents.isDestroyed() || this.page.webContents.isDestroyed()) return;
    const wc = this.page.webContents;
    const snap: LittleSnapshot = { url: wc.getURL(), title: wc.getTitle(), loading: wc.isLoading(), canGoBack: wc.navigationHistory.canGoBack(), private: this.isPrivate, color: this.isPrivate ? "#3a2f55" : this.host.color() };
    this.bar.webContents.send("little", snap);
  }

  command(c: "back" | "reload" | "promote" | "close" | "copy"): void {
    const wc = this.page.webContents;
    if (c === "back" && wc.navigationHistory.canGoBack()) wc.navigationHistory.goBack();
    if (c === "reload") wc.reload();
    if (c === "copy") clipboard.writeText(wc.getURL());
    if (c === "promote" && !this.isPrivate) {
      this.host.promote(wc.getURL());
      this.win.close();
    }
    if (c === "close") this.win.close();
  }

  navigate(input: string): void {
    this.page.webContents.loadURL(toNavigableUrl(input, this.host.engine()));
  }

  owns(wc: Electron.WebContents): boolean {
    return wc === this.bar.webContents;
  }
}
