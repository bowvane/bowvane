import { useEffect, useMemo, useRef, useState } from "react";
import type { CommandAction, CommandResult } from "../core/commandBar";
import type { Appearance, Boost, Rule, Settings, Space, TabItem } from "../core/model";
import type { OverlayView, PanelData, Snapshot } from "../shared/ipc";
import { Favicon } from "./Favicon";
import { ExtIcon, Icon } from "./Icon";
import { faviconFor, send, useUi } from "./store";
import { useSpaceTheme } from "./theme";

const close = () => send({ type: "closeOverlay" });

function usePanel(view: OverlayView, seq: number): PanelData | null {
  const [data, setData] = useState<PanelData | null>(null);
  useEffect(() => {
    let live = true;
    setData(null);
    const load = () => void window.bowvane.panelData().then((d) => live && setData(d), (e) => console.error(e));
    load();
    const t = view.kind === "downloads" ? setInterval(load, 1000) : undefined;
    return () => {
      live = false;
      if (t) clearInterval(t);
    };
  }, [seq]);
  return data;
}

function resultUrl(snap: Snapshot, r: CommandResult): string | null {
  if (r.kind === "open") return r.url;
  if (r.kind === "switch") {
    const t = snap.state.items.find((i) => i.id === r.tabId);
    return t?.kind === "tab" ? t.url : null;
  }
  return null;
}

function CommandBar({ snap, view }: { snap: Snapshot; view: Extract<OverlayView, { kind: "command" }> }) {
  const results = useUi((s) => s.results);
  const [query, setQuery] = useState(view.initial);
  const [sel, setSel] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLDivElement>(null);
  useEffect(() => {
    send({ type: "commandQuery", query: view.initial });
    input.current?.focus();
    input.current?.select();
  }, []);
  useEffect(() => setSel(0), [results]);
  // Accolades : scrollIntoView peut renvoyer une Promise, que React prendrait pour un nettoyage.
  useEffect(() => {
    list.current?.children[sel]?.scrollIntoView({ block: "nearest" });
  }, [sel]);
  const run = (i: number) => {
    const r = results[i];
    if (r) send({ type: "commandRun", result: r, replaceCurrent: view.replaceCurrent });
    else if (query.trim()) send({ type: "navigate", input: query, replaceCurrent: view.replaceCurrent });
  };
  return (
    <div className="panel command" onClick={(e) => e.stopPropagation()} data-testid="command-bar">
      <div className="command-field">
      <Icon name="search" />
      <input
        ref={input}
        className="command-input"
        value={query}
        placeholder="Rechercher, saisir une URL ou une action…"
        onChange={(e) => {
          setQuery(e.target.value);
          send({ type: "commandQuery", query: e.target.value });
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") (e.preventDefault(), setSel((s) => Math.min(s + 1, Math.max(0, results.length - 1))));
          if (e.key === "ArrowUp") (e.preventDefault(), setSel((s) => Math.max(s - 1, 0)));
          if (e.key === "Enter") run(sel);
          if (e.key === "Escape") close();
        }}
      />
      </div>
      <div className="results" ref={list}>
        {results.map((r, i) => (
          <div key={i} className={`result ${i === sel ? "sel" : ""}`} onMouseEnter={() => setSel(i)} onClick={() => run(i)} data-testid="command-result">
            <span className="result-icon">
              {r.kind === "action" ? <Icon name="bolt" /> : <Favicon src={resultUrl(snap, r) ? faviconFor(snap, resultUrl(snap, r)!) : null} title={r.title} />}
            </span>
            <span className="result-title">{r.title}</span>
            <span className="result-sub">{r.kind === "switch" ? "Basculer · " + r.subtitle.replace("Onglet · ", "") : r.subtitle}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ListPanel({ title, children, filter, setFilter }: { title: string; children: React.ReactNode; filter?: string; setFilter?: (v: string) => void }) {
  return (
    <div className="panel list" onClick={(e) => e.stopPropagation()}>
      <header>
        <h2>{title}</h2>
        <button className="icon" title="Fermer" onClick={close}><Icon name="close" /></button>
      </header>
      {setFilter && <input className="filter" autoFocus placeholder="Filtrer…" value={filter} onChange={(e) => setFilter(e.target.value)} />}
      <div className="list-body">{children}</div>
    </div>
  );
}

const when = (t: number) => new Date(t).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" });

function History({ data }: { data: PanelData }) {
  const [f, setF] = useState("");
  const rows = data.history.filter((v) => (v.title + v.url).toLowerCase().includes(f.toLowerCase())).slice(0, 300);
  return (
    <ListPanel title="Historique" filter={f} setFilter={setF}>
      {rows.map((v, i) => (
        <div key={i} className="list-row" onClick={() => send({ type: "openHistory", url: v.url })}>
          <span className="grow">{v.title || v.url}</span>
          <span className="muted">{when(v.visitedAt)}</span>
        </div>
      ))}
      {rows.length === 0 && <p className="muted">Rien pour l’instant.</p>}
    </ListPanel>
  );
}

function Archive({ data, snap }: { data: PanelData; snap: Snapshot }) {
  const [f, setF] = useState("");
  const spaces = new Map(snap.state.spaces.map((s) => [s.id, s.title]));
  return (
    <ListPanel title="Onglets archivés" filter={f} setFilter={setF}>
      {data.archive.map((a, index) =>
        (a.title + a.url).toLowerCase().includes(f.toLowerCase()) ? (
          <div key={index} className="list-row" onClick={() => send({ type: "reopenArchived", index })} data-testid="archive-row">
            <span className="grow">{a.title || a.url}</span>
            <span className="muted">{a.spaceId ? spaces.get(a.spaceId) : ""} · {when(a.archivedAt)}</span>
          </div>
        ) : null,
      )}
      {data.archive.length === 0 && <p className="muted">Les onglets Today inactifs arrivent ici.</p>}
    </ListPanel>
  );
}

function Downloads({ data }: { data: PanelData }) {
  return (
    <ListPanel title="Téléchargements">
      {data.downloads.map((d) => (
        <div key={d.id} className="list-row" onClick={() => send({ type: "showDownload", id: d.id })}>
          <span className="grow">{d.filename}</span>
          <span className="muted">
            {d.state === "progressing" ? `${Math.round((100 * d.receivedBytes) / Math.max(1, d.totalBytes))} %` : d.state === "completed" ? "Afficher dans le Finder" : d.state}
          </span>
        </div>
      ))}
      {data.downloads.length === 0 && <p className="muted">Aucun téléchargement pendant cette session.</p>}
    </ListPanel>
  );
}

const PALETTE = ["#7c6cf2", "#f27c6c", "#3fb68b", "#f2b84b", "#4ba3f2", "#d36cf2", "#8a8f98", "#1f2937", "#ff5fa2", "#00b3a4"];

function SpaceEditor({ snap, spaceId }: { snap: Snapshot; spaceId: string | null }) {
  const existing = snap.state.spaces.find((s) => s.id === spaceId);
  const [title, setTitle] = useState(existing?.title ?? "");
  const [icon, setIcon] = useState(existing?.icon ?? "");
  const [color, setColor] = useState<string | null>(existing ? existing.color : PALETTE[snap.state.spaces.length % PALETTE.length]!);
  const [appearance, setAppearance] = useState<Appearance>(existing?.appearance ?? "light");
  const [profile, setProfile] = useState(existing?.profile ?? "default");
  const profiles = [...new Set(["default", ...snap.state.spaces.map((s) => s.profile)])];
  const save = () => send({ type: "saveSpace", spaceId, changes: { title: title.trim() || "Space", icon: [...icon.trim()].slice(0, 2).join(""), color, appearance, profile } satisfies Pick<Space, "title" | "icon" | "color" | "appearance" | "profile"> });
  return (
    <div className="panel form" onClick={(e) => e.stopPropagation()} data-testid="space-editor">
      <header>
        <h2>{existing ? "Modifier le Space" : "Nouveau Space"}</h2>
        <button className="icon" title="Fermer" onClick={close}><Icon name="close" /></button>
      </header>
      <label>Nom<input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} onKeyDown={(e) => e.key === "Enter" && save()} data-testid="space-name" /></label>
      <label>Icône (emoji)<input value={icon} onChange={(e) => setIcon(e.target.value)} placeholder="🚀" /></label>
      <div className="field">
        Couleur
        <div className="palette">
          <button className={`swatch-btn neutral ${color === null ? "sel" : ""}`} title="Neutre" onClick={() => setColor(null)} />
          {PALETTE.map((c) => (
            <button key={c} className={`swatch-btn ${c === color ? "sel" : ""}`} style={{ background: c }} onClick={() => setColor(c)} />
          ))}
          <input type="color" value={color ?? "#7c6cf2"} onChange={(e) => setColor(e.target.value)} />
        </div>
      </div>
      <div className="field">
        Apparence
        <div className="segmented" data-testid="space-appearance">
          {([["light", "Claire"], ["dark", "Sombre"], ["system", "Système"]] as [Appearance, string][]).map(([a, label]) => (
            <button key={a} className={appearance === a ? "sel" : ""} onClick={() => setAppearance(a)}>{label}</button>
          ))}
        </div>
      </div>
      <label>
        Profil (cookies et connexions)
        <select value={profile} onChange={(e) => setProfile(e.target.value)}>
          {profiles.map((p) => (
            <option key={p} value={p}>{p === "default" ? "Profil principal" : p}</option>
          ))}
          {!existing && <option value="separate">Nouveau profil séparé</option>}
        </select>
      </label>
      <div className="actions">
        <button onClick={close}>Annuler</button>
        <button className="primary" onClick={save} data-testid="space-save">{existing ? "Enregistrer" : "Créer"}</button>
      </div>
    </div>
  );
}

const ENGINES: [string, string][] = [
  ["Google", "https://www.google.com/search?q=%s"],
  ["DuckDuckGo", "https://duckduckgo.com/?q=%s"],
  ["Qwant", "https://www.qwant.com/?q=%s"],
  ["Ecosia", "https://www.ecosia.org/search?q=%s"],
  ["Brave", "https://search.brave.com/search?q=%s"],
  ["Perplexity", "https://www.perplexity.ai/search?q=%s"],
];
const ARCHIVE: [string, number][] = [["12 heures", 12], ["24 heures", 24], ["7 jours", 168], ["30 jours", 720], ["Jamais", 1e7]];

function SettingsPanel({ snap }: { snap: Snapshot }) {
  const s = snap.state.settings;
  const set = (settings: Partial<Settings>) => send({ type: "saveSettings", settings });
  const [rules, setRules] = useState<Rule[]>(snap.state.rules);
  const saveRules = (next: Rule[]) => (setRules(next), send({ type: "saveRules", rules: next.filter((r) => r.match.trim()) }));
  return (
    <div className="panel form wide" onClick={(e) => e.stopPropagation()} data-testid="settings">
      <header>
        <h2>Réglages</h2>
        <button className="icon" title="Fermer" onClick={close}><Icon name="close" /></button>
      </header>
      <label>
        Archiver les onglets Today inactifs après
        <select value={Math.round(s.archiveAfterMs / 3_600_000)} onChange={(e) => set({ archiveAfterMs: Number(e.target.value) * 3_600_000 })}>
          {ARCHIVE.map(([l, h]) => <option key={h} value={h}>{l}</option>)}
        </select>
      </label>
      <label>
        Moteur de recherche
        <select value={s.searchEngine} onChange={(e) => set({ searchEngine: e.target.value })}>
          {ENGINES.map(([l, u]) => <option key={u} value={u}>{l}</option>)}
        </select>
      </label>
      <label className="check"><input type="checkbox" checked={s.adblock} onChange={(e) => set({ adblock: e.target.checked })} /> Bloquer les pubs et traqueurs</label>
      <label className="check"><input type="checkbox" checked={s.externalLinksInLittle} onChange={(e) => set({ externalLinksInLittle: e.target.checked })} /> Ouvrir les liens des autres apps dans Little Bowvane</label>

      <h3>Air Traffic Control</h3>
      <p className="muted">Envoie automatiquement les liens d’un site vers un Space ou Little Bowvane.</p>
      {rules.map((r, i) => (
        <div className="rule" key={r.id}>
          <input value={r.match} placeholder="github.com/mon-org" onChange={(e) => setRules(rules.map((x, j) => (j === i ? { ...x, match: e.target.value } : x)))} onBlur={() => saveRules(rules)} />
          <span>→</span>
          <select
            value={r.target.kind === "little" ? "little" : r.target.spaceId}
            onChange={(e) => saveRules(rules.map((x, j) => (j === i ? { ...x, target: e.target.value === "little" ? { kind: "little" } : { kind: "space", spaceId: e.target.value } } : x)))}
          >
            <option value="little">Little Bowvane</option>
            {snap.state.spaces.map((sp) => <option key={sp.id} value={sp.id}>{sp.icon} {sp.title}</option>)}
          </select>
          <button className="icon" title="Supprimer" onClick={() => saveRules(rules.filter((_, j) => j !== i))}><Icon name="close" /></button>
        </div>
      ))}
      <button onClick={() => setRules([...rules, { id: crypto.randomUUID(), match: "", target: { kind: "space", spaceId: snap.state.activeSpaceId } }])}>+ Ajouter une règle</button>

      <h3>Boosts</h3>
      {snap.state.boosts.length === 0 && <p className="muted">Aucun Boost. Clic droit sur une page › Booster ce site.</p>}
      {snap.state.boosts.map((b) => (
        <div className="rule" key={b.id}>
          <label className="check grow"><input type="checkbox" checked={b.enabled} onChange={(e) => send({ type: "saveBoost", boost: { ...b, enabled: e.target.checked } })} /> {b.host}</label>
          <span className="muted">{b.zapped.length} zap · {b.css ? "CSS" : ""} {b.js ? "JS" : ""}</span>
          <button className="icon" title="Modifier" onClick={() => send({ type: "openOverlay", view: { kind: "boost", host: b.host } })}><Icon name="gear" /></button>
          <button className="icon" title="Supprimer" onClick={() => send({ type: "deleteBoost", id: b.id })}><Icon name="close" /></button>
        </div>
      ))}

      <h3>Arc</h3>
      <button disabled={!snap.arcAvailable} onClick={() => send({ type: "importArc" })}>Réimporter la barre latérale d’Arc…</button>
    </div>
  );
}

function BoostEditor({ data }: { data: PanelData }) {
  const [b, setB] = useState<Boost | null>(data.boost);
  if (!b) return null;
  return (
    <div className="panel form wide" onClick={(e) => e.stopPropagation()} data-testid="boost-editor">
      <header>
        <h2>Boost · {b.host}</h2>
        <button className="icon" title="Fermer" onClick={close}><Icon name="close" /></button>
      </header>
      <label className="check"><input type="checkbox" checked={b.enabled} onChange={(e) => setB({ ...b, enabled: e.target.checked })} /> Actif</label>
      <label>CSS<textarea spellCheck={false} rows={8} value={b.css} placeholder="body { font-family: Inter; }" onChange={(e) => setB({ ...b, css: e.target.value })} /></label>
      <label>JavaScript (exécuté à chaque chargement)<textarea spellCheck={false} rows={6} value={b.js} onChange={(e) => setB({ ...b, js: e.target.value })} /></label>
      <div className="field">
        Éléments masqués (Zap)
        {b.zapped.map((z, i) => (
          <div className="rule" key={i}>
            <code className="grow">{z}</code>
            <button className="icon" title="Retirer" onClick={() => setB({ ...b, zapped: b.zapped.filter((_, j) => j !== i) })}><Icon name="close" /></button>
          </div>
        ))}
        {b.zapped.length === 0 && <span className="muted">Aucun.</span>}
      </div>
      <div className="actions">
        <button onClick={() => send({ type: "action", action: "zap" })}>Zap un élément</button>
        <span className="grow" />
        <button onClick={close}>Annuler</button>
        <button className="primary" onClick={() => (send({ type: "saveBoost", boost: b }), close())}>Enregistrer et recharger</button>
      </div>
    </div>
  );
}

function FindBar() {
  const find = useUi((s) => s.find);
  const [text, setText] = useState("");
  return (
    <div className="findbar">
      <input
        autoFocus
        value={text}
        placeholder="Rechercher dans la page"
        onChange={(e) => (setText(e.target.value), send({ type: "find", text: e.target.value, forward: true }))}
        onKeyDown={(e) => {
          if (e.key === "Enter") send({ type: "find", text, forward: !e.shiftKey });
          if (e.key === "Escape") send({ type: "findStop" });
        }}
      />
      <span className="muted">{text ? `${find.active}/${find.total}` : ""}</span>
      <button className="icon" title="Précédent" onClick={() => send({ type: "find", text, forward: false })}><span style={{ transform: "rotate(90deg)" }}><Icon name="back" /></span></button>
      <button className="icon" title="Suivant" onClick={() => send({ type: "find", text, forward: true })}><span style={{ transform: "rotate(90deg)" }}><Icon name="forward" /></span></button>
      <button className="icon" title="Fermer" onClick={() => send({ type: "findStop" })}><Icon name="close" /></button>
    </div>
  );
}

function PeekChrome({ snap, url }: { snap: Snapshot; url: string }) {
  const left = (snap.sidebarVisible ? snap.state.settings.sidebarWidth : 10) + 48;
  return (
    <div className="peek-bar" style={{ left, right: 58, top: 20 }} onClick={(e) => e.stopPropagation()}>
      <span className="grow muted">{url}</span>
      <button onClick={() => send({ type: "peekExpand" })} data-testid="peek-expand">Ouvrir en onglet</button>
      <button className="icon" title="Fermer" onClick={close}><Icon name="close" /></button>
    </div>
  );
}

const SITE_WIDTH = 252;

/** Menu de contrôle du site, comme celui d’Arc : actions, extensions, réglages du site, sécurité. */
function SiteControls({ snap, view }: { snap: Snapshot; view: Extract<OverlayView, { kind: "site" }> }) {
  const s = snap.state;
  const tab = s.items.find((i): i is TabItem => i.kind === "tab" && i.id === s.activeTabBySpace[s.activeSpaceId]);
  let host = "";
  try {
    host = tab ? new URL(tab.url).hostname.replace(/^www\./, "") : "";
  } catch {
    host = "";
  }
  const boost = host ? s.boosts.find((b) => b.host === host) : undefined;
  const left = Math.max(8, Math.min(view.x - SITE_WIDTH / 2, window.innerWidth - SITE_WIDTH - 8));
  const run = (action: CommandAction) => {
    close();
    send({ type: "action", action });
  };
  return (
    <div className="site-controls" data-testid="site-controls" style={{ left, top: view.y, width: SITE_WIDTH }} onClick={(e) => e.stopPropagation()}>
      {tab && (
        <div className="site-actions">
          <button title="Copier le lien (⇧⌘C)" onClick={() => run("copyUrl")}><Icon name="link" /></button>
          <button title="Booster ce site" onClick={() => send({ type: "action", action: "boost" })}><Icon name="brush" /></button>
          <button title="Capturer la page (⇧⌘2)" onClick={() => run("capture")}><Icon name="camera" /></button>
          <button title="Zap : masquer un élément" onClick={() => run("zap")}><Icon name="bolt" /></button>
        </div>
      )}
      {snap.extensions.length > 0 && (
        <>
          <div className="site-title">Extensions</div>
          <div className="site-ext-grid">
            {snap.extensions.map((x) => (
              <button
                key={x.id}
                className={`site-ext ${x.pinned ? "pinned" : ""}`}
                title={`${x.name}\nClic droit : ${x.pinned ? "retirer de" : "épingler dans"} la barre du haut`}
                data-testid={`ext-tile-${x.id}`}
                onClick={(e) => {
                  const r = e.currentTarget.getBoundingClientRect();
                  send({ type: "openExtension", id: x.id, x: Math.round(r.left), y: Math.round(r.bottom + 6) });
                }}
                onContextMenu={(e) => {
                  e.preventDefault();
                  send({ type: "pinExtension", id: x.id, pinned: !x.pinned });
                }}
              >
                <ExtIcon icon={x.icon} name={x.name} size={18} />
              </button>
            ))}
          </div>
        </>
      )}
      {boost && (
        <>
          <div className="site-title">Réglages du site</div>
          <label className="site-setting">
            <span className="site-setting-icon"><Icon name="brush" size={14} /></span>
            <span className="grow">
              <span className="site-setting-name">Boost</span>
              <span className="site-setting-state">{boost.enabled ? "Actif" : "Désactivé"}</span>
            </span>
            <input type="checkbox" checked={boost.enabled} onChange={() => send({ type: "saveBoost", boost: { ...boost, enabled: !boost.enabled } })} />
          </label>
          {boost.zapped.length > 0 && (
            <div className="site-setting">
              <span className="site-setting-icon"><Icon name="bolt" size={14} /></span>
              <span className="grow">
                <span className="site-setting-name">Éléments masqués</span>
                <span className="site-setting-state">{boost.zapped.length}</span>
              </span>
              <button className="site-link" onClick={() => send({ type: "saveBoost", boost: { ...boost, zapped: [] } })}>Réafficher</button>
            </div>
          )}
        </>
      )}
      <div className="site-footer">
        {tab && (
          <span className={`site-security ${tab.url.startsWith("https:") ? "" : "warn"}`}>
            <Icon name="lock" size={13} />
            <span data-testid="site-security">{tab.url.startsWith("https:") ? "Sécurisé" : "Non sécurisé"}</span>
          </span>
        )}
        <span className="grow" />
        <button className="icon" title="Réglages" onClick={() => send({ type: "openOverlay", view: { kind: "settings" } })}><Icon name="more" /></button>
      </div>
    </div>
  );
}

export function Overlay() {
  const snap = useUi((s) => s.snap);
  const view = snap?.overlay ?? { kind: "none" as const };
  const data = usePanel(view, snap?.overlaySeq ?? 0);
  useSpaceTheme(snap ? (snap.state.spaces.find((s) => s.id === snap.state.activeSpaceId) ?? snap.state.spaces[0]) : undefined);
  const body = useMemo(() => {
    if (!snap) return null;
    switch (view.kind) {
      case "command": return <CommandBar key={snap.overlaySeq} snap={snap} view={view} />;
      case "history": return data && <History data={data} />;
      case "archive": return data && <Archive data={data} snap={snap} />;
      case "downloads": return data && <Downloads data={data} />;
      case "settings": return <SettingsPanel key={snap.overlaySeq} snap={snap} />;
      case "space": return <SpaceEditor key={snap.overlaySeq} snap={snap} spaceId={view.spaceId} />;
      case "boost": return data?.boost && <BoostEditor key={data.boost.id + data.boost.zapped.length} data={data} />;
      case "peek": return <PeekChrome snap={snap} url={view.url} />;
      case "site": return <SiteControls snap={snap} view={view} />;
      default: return null;
    }
  }, [snap, view, data]);
  if (view.kind === "find") return <FindBar />;
  if (view.kind === "none") return null;
  return (
    <div className={`backdrop ${view.kind}`} onClick={close}>
      {body}
    </div>
  );
}
