"use client";

import { useEffect, useState } from "react";
import { formatMonth } from "@/lib/api";
import { useT } from "@/lib/i18n";
import { Reticle } from "@/components/player";

// Real D6 frames of Barnard's Star saved from the production API (job for 269.4462, +4.7682, 6′), so the hero
// shows the actual evidence without waiting on the archive.
const FRAMES = [
  { src: "/demo/barnard-0.png", date: "2025-08-21" },
  { src: "/demo/barnard-1.png", date: "2026-04-11" },
  { src: "/demo/barnard-2.png", date: "2026-09-03" },
];

export function HeroBlink({ onOpen }: { onOpen: () => void }) {
  const { t } = useT();
  const [i, setI] = useState(0);
  const [auto, setAuto] = useState(true);

  useEffect(() => {
    if (!auto || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const id = setInterval(() => setI((k) => (k + 1) % FRAMES.length), 900);
    return () => clearInterval(id);
  }, [auto]);

  return (
    <figure className="fade-up mx-auto w-full max-w-[472px]" style={{ animationDelay: "0.3s" }}>
      <button
        type="button"
        onClick={onOpen}
        aria-label={t.hero.demoOpen}
        className="group relative block aspect-square w-full overflow-hidden rounded-xl border bg-black shadow-[0_0_80px_-30px_oklch(0.85_0.13_205/0.5)] transition-transform hover:-translate-y-0.5"
      >
        {FRAMES.map((f, k) => (
          // eslint-disable-next-line @next/next/no-img-element -- 59 px real frame, upscaled pixel-exact
          <img key={f.src} src={f.src} alt="" className={`absolute inset-0 size-full ${k === i ? "" : "invisible"}`} style={{ imageRendering: "pixelated" }} />
        ))}
        <Reticle uncertain={false} />
        <span className="absolute top-2 left-2 rounded bg-black/70 px-2 py-1 font-mono text-sm text-white tabular-nums">
          {formatMonth(FRAMES[i].date, t.locale)} · D6
        </span>
        <span className="absolute top-2 right-2 flex items-center gap-1.5 rounded bg-black/70 px-2 py-1 font-mono text-[10px] tracking-widest text-white uppercase">
          <span aria-hidden className="size-1.5 rounded-full bg-primary" />
          {t.player.real}
        </span>
      </button>
      <figcaption className="mt-3 space-y-2 text-center text-sm text-muted-foreground">
        <span className="block">{t.hero.demo}</span>
        <span role="group" aria-label={t.player.timeline} className="flex justify-center gap-1">
          {FRAMES.map((f, k) => (
            <button
              key={f.src}
              type="button"
              aria-pressed={k === i}
              onClick={() => {
                setAuto(false);
                setI(k);
              }}
              className={`min-h-9 rounded border px-2 font-mono text-xs ${k === i ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted"}`}
            >
              {formatMonth(f.date, t.locale)}
            </button>
          ))}
        </span>
      </figcaption>
    </figure>
  );
}
