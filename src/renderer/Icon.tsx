/** Icônes au trait façon SF Symbols, 16 px, couleur héritée (currentColor). */
const PATHS = {
  sidebar: <><rect x="2" y="3" width="12" height="10" rx="2.2" /><path d="M6 3.2v9.6" /></>,
  back: <path d="M9.8 3.5 5.3 8l4.5 4.5" />,
  forward: <path d="M6.2 3.5 10.7 8l-4.5 4.5" />,
  reload: <><path d="M12.6 8a4.6 4.6 0 1 1-1.4-3.3" /><path d="M11.6 2.4v2.6H9" /></>,
  plus: <path d="M8 3v10M3 8h10" />,
  close: <path d="m4.5 4.5 7 7m0-7-7 7" />,
  minus: <path d="M4 8h8" />,
  archive: <><rect x="2.2" y="2.8" width="11.6" height="3.4" rx="1" /><path d="M3.3 6.2v6a1.2 1.2 0 0 0 1.2 1.2h7a1.2 1.2 0 0 0 1.2-1.2v-6M6.5 8.8h3" /></>,
  download: <><path d="M8 2.5v7.5M4.8 7 8 10.2 11.2 7" /><path d="M3 13.3h10" /></>,
  gear: <><circle cx="8" cy="8" r="2.1" /><path d="M8 1.8v1.6M8 12.6v1.6M1.8 8h1.6M12.6 8h1.6M3.6 3.6l1.1 1.1M11.3 11.3l1.1 1.1M3.6 12.4l1.1-1.1M11.3 4.7l1.1-1.1" /></>,
  search: <><circle cx="7" cy="7" r="4.3" /><path d="m10.2 10.2 3.3 3.3" /></>,
  bolt: <path d="M9 1.8 3.8 9h4l-1 5.2L12.2 7h-4z" />,
  split: <><rect x="2" y="3" width="12" height="10" rx="2" /><path d="M8 3v10" /></>,
  speaker: <><path d="M2.5 6h2.3L8 3.3v9.4L4.8 10H2.5z" /><path d="M10.6 5.6a3.4 3.4 0 0 1 0 4.8M12.3 3.9a5.8 5.8 0 0 1 0 8.2" /></>,
  muted: <><path d="M2.5 6h2.3L8 3.3v9.4L4.8 10H2.5z" /><path d="m10.4 6 3.6 4m0-4-3.6 4" /></>,
  copy: <><rect x="5.3" y="5.3" width="8" height="8" rx="1.6" /><path d="M10.7 5.3V4a1.3 1.3 0 0 0-1.3-1.3H4A1.3 1.3 0 0 0 2.7 4v5.4A1.3 1.3 0 0 0 4 10.7h1.3" /></>,
  lock: <><rect x="3.5" y="7" width="9" height="6.5" rx="1.6" /><path d="M5.5 7V5.2a2.5 2.5 0 0 1 5 0V7" /></>,
  more: <><circle cx="3.5" cy="8" r="0.6" /><circle cx="8" cy="8" r="0.6" /><circle cx="12.5" cy="8" r="0.6" /></>,
  folderAdd: <><path d="M2 5.2V4a1.2 1.2 0 0 1 1.2-1.2h3l1.4 1.6h5.2A1.2 1.2 0 0 1 14 5.6v6.2a1.2 1.2 0 0 1-1.2 1.2H3.2A1.2 1.2 0 0 1 2 11.8z" /><path d="M8 7v4M6 9h4" /></>,
  expand: <path d="M9.5 2.5h4v4M6.5 13.5h-4v-4M13.5 2.5 9 7M2.5 13.5 7 9" />,
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({ name, size = 16 }: { name: IconName; size?: number }) {
  return (
    <svg className="svg-icon" width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {PATHS[name]}
    </svg>
  );
}

/** Dossier plein dans la couleur d’accent du Space, comme dans Arc. */
export function FolderIcon({ open }: { open: boolean }) {
  return (
    <svg className="folder-icon" width={16} height={16} viewBox="0 0 16 16" aria-hidden>
      {open ? (
        <>
          <path d="M1.8 4A1.3 1.3 0 0 1 3.1 2.7h3.1l1.4 1.5h5.1a1.3 1.3 0 0 1 1.3 1.3v1H4.2L1.8 12z" fill="var(--accent)" opacity="0.55" />
          <path d="M3.9 6.6h10.7l-2 6.1a.9.9 0 0 1-.9.6H2.2z" fill="var(--accent)" />
        </>
      ) : (
        <path d="M1.8 4A1.3 1.3 0 0 1 3.1 2.7h3.1l1.4 1.5h5.3a1.3 1.3 0 0 1 1.3 1.3V12a1.3 1.3 0 0 1-1.3 1.3H3.1A1.3 1.3 0 0 1 1.8 12z" fill="var(--accent)" />
      )}
    </svg>
  );
}
