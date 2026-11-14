"use client";

import { useEffect, useRef, useState } from "react";
import { Check, ChevronLeft, ChevronRight, Link2, Pause, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatMonth as month, type Frame } from "@/lib/api";
import { useT } from "@/lib/i18n";
import { useEggs } from "@/lib/eggs";

const SPEEDS = [1200, 600, 250];
// SPHEREx pixels are 6.15″ wide, so one arcminute is about 9.8 pixels of the original image.
const PX_PER_ARCMIN = 60 / 6.15;

const label = (f: Frame, locale: string) =>
  `${month(f.mid_date, locale)} · ${f.detector} · ${f.wavelength_um[0].toFixed(2)}–${f.wavelength_um[1].toFixed(2)} µm`;

type Props = { frames: Frame[]; waiting: boolean; object?: { name: string; index: number } };

export function Player({ frames, waiting, object }: Props) {
  const { t } = useT();
  const p = t.player;
  const ready = frames.filter((f) => f.status === "ready" && f.image_url);
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [speed, setSpeed] = useState(SPEEDS[1]);
  const n = ready.length;
  const current = Math.min(index, n - 1);
  const animating = playing && n > 1;
  const { unlock } = useEggs();
  const [uncertain, setUncertain] = useState(false);
  const [width, setWidth] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  };
  const poke = () => {
    setUncertain(true);
    setTimeout(() => setUncertain(false), 2600);
    unlock("heisenberg");
  };

  useEffect(() => {
    if (!animating) return;
    const id = setInterval(() => setIndex((i) => (Math.min(i, n - 1) + 1) % n), speed);
    return () => clearInterval(id);
  }, [animating, speed, n]);

  const step = (d: number) => {
    setPlaying(false);
    setIndex((i) => (Math.min(i, n - 1) + d + n) % n);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      // Only while the player has focus, so Space still scrolls the rest of the page.
      if (!root.current?.contains(el) || e.altKey || e.ctrlKey || e.metaKey) return;
      if (e.key === " " && el.tagName !== "BUTTON") {
        e.preventDefault();
        setPlaying((p) => !p);
      } else if (e.key === "ArrowLeft") step(-1);
      else if (e.key === "ArrowRight") step(1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (n === 0) return null;

  return (
    <div ref={root} className="space-y-3">
      <div
        tabIndex={0}
        role="group"
        aria-label={p.imageAlt}
        aria-describedby="player-keys"
        className="relative mx-auto aspect-square w-full max-w-[472px] overflow-hidden rounded-xl border bg-black shadow-[0_0_80px_-30px_oklch(0.85_0.13_205/0.5)] outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        onClick={poke}
      >
        {ready.map((f, i) => (
          // eslint-disable-next-line @next/next/no-img-element -- tiny PNGs from the API, upscaled pixel-exact
          <img
            key={f.id}
            src={f.image_url!}
            alt={i === current ? `${p.imageAlt}, ${label(f, t.locale)}` : ""}
            onLoad={(e) => setWidth(e.currentTarget.naturalWidth)}
            className={`absolute inset-0 size-full ${i === current ? "" : "invisible"}`}
            style={{ imageRendering: "pixelated" }}
          />
        ))}
        <Reticle uncertain={uncertain} />
        <div className="absolute top-2 left-2 rounded bg-black/70 px-2 py-1 font-mono text-sm text-white">
          {label(ready[current], t.locale)}
        </div>
        <div aria-label={p.compass} role="img" className="absolute right-2 bottom-2 rounded bg-black/70 px-2 py-1 font-mono text-xs text-white">
          N ↑ E ←
        </div>
        {width > 0 && (
          <div aria-label={p.scale} role="img" className="absolute bottom-3 left-3 font-mono text-xs text-white [text-shadow:0_0_4px_black]" style={{ width: `${(PX_PER_ARCMIN / width) * 100}%` }}>
            1′
            <span className="mt-0.5 block h-0.5 bg-white shadow-[0_0_3px_black]" />
          </div>
        )}
        {waiting && n === 1 && (
          <div className="absolute inset-x-0 bottom-10 text-center text-sm text-white">
            <span className="rounded bg-black/70 px-2 py-1">{p.waiting}</span>
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-center gap-2">
        <Button variant="outline" size="icon" onClick={() => step(-1)} disabled={n < 2} aria-label={p.prev}>
          <ChevronLeft />
        </Button>
        <Button size="icon" onClick={() => setPlaying((p) => !p)} disabled={n < 2} aria-label={animating ? p.pause : p.play}>
          {animating ? <Pause /> : <Play />}
        </Button>
        <Button variant="outline" size="icon" onClick={() => step(1)} disabled={n < 2} aria-label={p.next}>
          <ChevronRight />
        </Button>
        <div role="group" aria-label={p.speed} className="ml-2 flex gap-1">
          {SPEEDS.map((ms, i) => (
            <Button
              key={ms}
              size="sm"
              variant={speed === ms ? "secondary" : "ghost"}
              aria-pressed={speed === ms}
              onClick={() => setSpeed(ms)}
            >
              {p.speeds[i]}
            </Button>
          ))}
        </div>
        <Button variant="outline" size="sm" onClick={copy} className="ml-2" aria-live="polite">
          {copied ? <Check aria-hidden /> : <Link2 aria-hidden />}
          {copied ? p.copied : p.copy}
        </Button>
      </div>

      <ol aria-label={p.timeline} className="flex gap-1">
        {frames.map((f) => {
          const i = ready.indexOf(f);
          return (
            <li key={f.id} className="flex-1">
              <button
                type="button"
                disabled={i < 0}
                aria-current={i === current ? "true" : undefined}
                onClick={() => {
                  setPlaying(false);
                  setIndex(i);
                }}
                className={`w-full rounded border px-1 py-1.5 font-mono text-xs outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-40 ${
                  i === current ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted"
                }`}
              >
                {f.status === "failed" ? p.missing : month(f.mid_date, t.locale)}
              </button>
            </li>
          );
        })}
      </ol>
      <div className="rounded-xl border bg-card/70 backdrop-blur-sm p-5 text-sm text-muted-foreground">
        <p className="font-medium text-foreground">{object ? object.name : p.whatTitle}</p>
        {object ? (
          <dl className="mt-2 space-y-2">
            <dt className="font-medium text-primary">{p.whatIs}</dt>
            <dd>{p.objects[object.index].what}</dd>
            <dt className="font-medium text-primary">{p.whatChanges}</dt>
            <dd>{p.objects[object.index].change}</dd>
          </dl>
        ) : (
          <p className="mt-1">{p.whatText}</p>
        )}
        <p id="player-keys" className="mt-2 text-xs">{p.keys}</p>
      </div>
    </div>
  );
}

function Reticle({ uncertain }: { uncertain: boolean }) {
  return (
    <svg viewBox="0 0 100 100" className={`pointer-events-none absolute inset-0 size-full ${uncertain ? "uncertain" : ""}`} aria-hidden>
      <g stroke="#22d3ee" strokeWidth="0.6" opacity="0.85">
        <line x1="50" y1="36" x2="50" y2="45" />
        <line x1="50" y1="55" x2="50" y2="64" />
        <line x1="36" y1="50" x2="45" y2="50" />
        <line x1="55" y1="50" x2="64" y2="50" />
      </g>
    </svg>
  );
}
