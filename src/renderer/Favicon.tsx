import { useState } from "react";

export function Favicon({ src, title, size = 16 }: { src: string | null; title: string; size?: number }) {
  const [broken, setBroken] = useState(false);
  if (src && !broken) return <img className="favicon" src={src} width={size} height={size} alt="" onError={() => setBroken(true)} />;
  const letter = (title.replace(/^https?:\/\/(www\.)?/, "")[0] ?? "•").toUpperCase();
  return (
    <span className="favicon letter" style={{ width: size, height: size, fontSize: size * 0.62 }}>
      {letter}
    </span>
  );
}
