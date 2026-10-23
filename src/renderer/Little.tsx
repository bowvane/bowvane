import { useEffect, useState } from "react";
import { Icon } from "./Icon";
import { send, useUi } from "./store";
import { useFlatTheme } from "./theme";

export function Little() {
  const little = useUi((s) => s.little);
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState("");
  useFlatTheme(little?.color);
  useEffect(() => {
    if (little && !editing) setValue(little.url);
  }, [little, editing]);
  if (!little) return null;
  const cmd = (command: "back" | "reload" | "promote" | "close" | "copy") => send({ type: "littleCommand", command });
  return (
    <div className={`littlebar ${little.private ? "private" : ""}`}>
      <button className="icon" title="Précédent" disabled={!little.canGoBack} onClick={() => cmd("back")}><Icon name="back" /></button>
      <button className="icon" title="Recharger" onClick={() => cmd("reload")}>{little.loading ? <span className="spinner" /> : <Icon name="reload" />}</button>
      <input
        className="little-url"
        value={editing ? value : little.title || little.url || "Saisis une adresse"}
        autoFocus={!little.url}
        onFocus={(e) => (setEditing(true), setValue(little.url), requestAnimationFrame(() => e.target.select()))}
        onBlur={() => setEditing(false)}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && value.trim()) (send({ type: "littleNavigate", input: value }), e.currentTarget.blur());
          if (e.key === "Escape") e.currentTarget.blur();
        }}
      />
      {little.private && <span className="private-badge">Privé</span>}
      <button className="icon" title="Copier l’URL" onClick={() => cmd("copy")}><Icon name="copy" /></button>
      {!little.private && (
        <button className="promote" title="Ouvrir dans Bowvane" onClick={() => cmd("promote")}>
          Ouvrir dans Bowvane
        </button>
      )}
    </div>
  );
}
