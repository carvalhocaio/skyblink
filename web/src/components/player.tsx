"use client";

import { useEffect, useRef, useState } from "react";
import { Check, ChevronLeft, ChevronRight, Crosshair as Target, GitCompareArrows, Pause, Play, Share2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatMonth as month, type Frame, type Motion } from "@/lib/api";
import { useT } from "@/lib/i18n";
import { Gloss } from "@/components/gloss";
import { useEggs } from "@/lib/eggs";
import { formatDec, formatRA, skyAt } from "@/lib/sky";
import Crosshair from "@/components/Crosshair";
import Counter from "@/components/Counter";

const SPEEDS = [1200, 600, 250];
// Same identities as the "Where did it go?" chart (cyan measured, amber predicted), lighter to stand out on the black sky.
const MEASURED = "#22d3ee";
const PREDICTED = "#fbbf24";
// SPHEREx pixels are 6.15″ wide, so one arcminute is about 9.8 pixels of the original image.
const PX_PER_ARCMIN = 60 / 6.15;

// Wavelengths in the visitor's language: 4.41 in English, 4,41 in Portuguese.
const um = ([lo, hi]: [number, number], locale: string) =>
  `${lo.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}–${hi.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} µm`;

const label = (f: Frame, locale: string) => `${month(f.mid_date, locale)} · ${f.detector} · ${um(f.wavelength_um, locale)}`;

type Props = {
  frames: Frame[];
  waiting: boolean;
  object?: { name: string; index: number };
  center?: { ra: number; dec: number };
  motion?: Motion | null;
};

export function Player({ frames, waiting, object, center, motion }: Props) {
  const { t } = useT();
  const p = t.player;
  // A PNG that fails to load is treated like a frame the server could not build.
  const [broken, setBroken] = useState<ReadonlySet<string>>(new Set());
  const ready = frames.filter((f) => f.status === "ready" && f.image_url && !broken.has(f.id));
  const [index, setIndex] = useState(0);
  // Plays on its own unless the visitor asked for less motion; then Play starts it.
  const [playing, setPlaying] = useState(() => typeof window === "undefined" || !matchMedia("(prefers-reduced-motion: reduce)").matches);
  const [speed, setSpeed] = useState(SPEEDS[1]);
  const n = ready.length;
  const current = Math.min(index, n - 1);
  const animating = playing && n > 1;
  // First ↔ last: blinking only the two ends makes a sub-pixel drift easier to see than the full loop.
  const [compare, setCompare] = useState(false);
  const [markers, setMarkers] = useState(true);
  const seq = compare && n > 2 ? [0, n - 1] : Array.from({ length: n }, (_, i) => i);
  const advance = (i: number, d: number) => seq[(seq.indexOf(Math.min(i, n - 1)) + d + seq.length) % seq.length];
  const { unlock } = useEggs();
  const [uncertain, setUncertain] = useState(false);
  const [width, setWidth] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const view = useRef<HTMLDivElement>(null);
  // Pointer → the RA/Dec under it, the two numbers astronomers use to find anything.
  const coords = (x: number, y: number, w: number, h: number): [string, string] => {
    if (!center || !width) return ["", ""];
    const at = skyAt(center, width / PX_PER_ARCMIN, x / w, y / h);
    return [`RA ${formatRA(at.ra)}`, `Dec ${formatDec(at.dec)}`];
  };
  const [copied, setCopied] = useState<"copied" | "failed" | null>(null);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(location.href);
      setCopied("copied");
    } catch {
      setCopied("failed");
    }
    setTimeout(() => setCopied(null), 2000);
  };
  const poke = () => {
    setUncertain(true);
    setTimeout(() => setUncertain(false), 2600);
    unlock("heisenberg");
  };

  useEffect(() => {
    if (!animating) return;
    const id = setInterval(() => setIndex((i) => advance(i, 1)), speed);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- advance depends only on n and compare
  }, [animating, speed, n, compare]);

  const step = (d: number) => {
    setPlaying(false);
    setIndex((i) => advance(i, d));
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

  const frame = ready[current];
  const fmt = (x: number) => x.toLocaleString(t.locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  // The measured shift of this picture from the reference season, straight from the API (null when not measured).
  const ref = motion?.seasons?.find((s) => s.season_id === motion.reference_season_id);
  const here = motion?.seasons?.find((s) => s.frame_id === frame.id);
  const shift = !here || !ref ? null : here === ref ? p.reference : p.moved(fmt(here.offset.total_arcsec), fmt(here.offset.total_err_arcsec), month(ref.mid_date, t.locale));
  // Positions on the picture (newer API only): the measured centroid, and the catalog's prediction placed from the
  // reference season's measured position. Grid y counts from the bottom; the PNG is north up.
  const canMark = !!motion?.seasons?.some((s) => s.position_px);
  const measuredAt = here?.position_px ?? null;
  const po = here?.predicted_offset;
  const predictedAt = ref?.position_px && po?.dx_px !== undefined && po.dy_px !== undefined ? [ref.position_px[0] + po.dx_px, ref.position_px[1] + po.dy_px] : null;
  const toSvg = ([x, y]: number[]) => [x + 0.5, width - 0.5 - y];

  return (
    <div ref={root} className="space-y-3">
      <div
        ref={view}
        tabIndex={0}
        role="group"
        aria-label={p.imageAlt}
        aria-describedby="player-keys"
        className="relative mx-auto aspect-square w-full max-w-[472px] cursor-crosshair overflow-hidden rounded-xl border bg-black shadow-[0_0_80px_-30px_oklch(0.85_0.13_205/0.5)] outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        onClick={poke}
      >
        {ready.map((f, i) => (
          // eslint-disable-next-line @next/next/no-img-element -- tiny PNGs from the API, upscaled pixel-exact
          <img
            key={f.id}
            src={f.image_url!}
            alt={i === current ? `${p.imageAlt}, ${label(f, t.locale)}` : ""}
            onLoad={(e) => setWidth(e.currentTarget.naturalWidth)}
            onError={() => setBroken((b) => new Set(b).add(f.id))}
            className={`absolute inset-0 size-full ${i === current ? "" : "invisible"}`}
            style={{ imageRendering: "pixelated" }}
          />
        ))}
        {markers && width > 0 && (measuredAt || predictedAt) && (
          <svg viewBox={`0 0 ${width} ${width}`} className="pointer-events-none absolute inset-0 size-full" aria-hidden>
            {predictedAt && (() => {
              const [x, y] = toSvg(predictedAt);
              return <rect x={x - 1.6} y={y - 1.6} width={3.2} height={3.2} transform={`rotate(45 ${x} ${y})`} fill="none" stroke={PREDICTED} strokeWidth={2} vectorEffect="non-scaling-stroke" />;
            })()}
            {measuredAt && (() => {
              const [x, y] = toSvg(measuredAt);
              return <circle cx={x} cy={y} r={2.4} fill="none" stroke={MEASURED} strokeWidth={2} vectorEffect="non-scaling-stroke" />;
            })()}
          </svg>
        )}
        <Reticle uncertain={uncertain} />
        <span className="absolute top-2 right-2 flex items-center gap-1.5 rounded bg-black/70 px-2 py-1 font-mono text-[10px] tracking-widest text-white uppercase">
          <span aria-hidden className="size-1.5 rounded-full bg-primary" />
          {p.real}
        </span>
        <div className="absolute top-2 left-2 flex items-center gap-1 rounded bg-black/70 px-2 py-1 font-mono text-sm text-white">
          {/* The year rolls over like an odometer as the flipbook crosses into a new year. */}
          {new Date(frame.mid_date).toLocaleDateString(t.locale, { month: "short", timeZone: "UTC" })}
          <Counter value={new Date(frame.mid_date).getUTCFullYear()} format={{ useGrouping: false }} intro={false} fontSize="0.875rem" duration={0.5} />
          <span>· {frame.detector} · {um(frame.wavelength_um, t.locale)}</span>
        </div>
        {center && width > 0 && <Crosshair containerRef={view} color="#22d3ee" lineStyle="dashed" gap={10} opacity={0.75} targetEffect="none" formatCoordinates={coords} />}
        <div aria-label={p.compass} role="img" className="absolute right-2 bottom-2 rounded bg-black/70 px-2 py-1 font-mono text-xs text-white">
          {p.compassShort}
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
        <Button
          variant={compare ? "secondary" : "outline"}
          size="sm"
          aria-pressed={compare}
          disabled={n < 3}
          title={p.compareHint}
          onClick={() => {
            setCompare((c) => !c);
            setIndex(0);
          }}
          className="ml-2"
        >
          <GitCompareArrows aria-hidden />
          {p.compare}
        </Button>
        {canMark && (
          <Button variant={markers ? "secondary" : "outline"} size="sm" aria-pressed={markers} title={p.markersHint} onClick={() => setMarkers((m) => !m)} className="ml-2">
            <Target aria-hidden />
            {p.markers}
          </Button>
        )}
        <span role="status" className="sr-only">
          {copied === "copied" ? p.copied : copied === "failed" ? p.copyFailed : ""}
        </span>
        <Button variant="outline" size="sm" onClick={copy} className="ml-2">
          {copied === "copied" ? <Check aria-hidden /> : copied === "failed" ? <X aria-hidden /> : <Share2 aria-hidden />}
          {copied === "copied" ? p.copied : copied === "failed" ? p.copyFailed : p.copy}
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
                title={f.status === "ready" ? p.exposures(f.n_exposures_used, f.n_exposures_available) : undefined}
                onClick={() => {
                  setPlaying(false);
                  setIndex(i);
                }}
                className={`w-full rounded border px-1 py-1.5 font-mono text-xs outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-40 ${
                  i === current ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted"
                }`}
              >
                {f.status === "failed" || broken.has(f.id) ? p.missing : month(f.mid_date, t.locale)}
              </button>
            </li>
          );
        })}
      </ol>
      <p className="text-center text-sm text-muted-foreground">
        <Gloss text={`${frame.detector} · ${um(frame.wavelength_um, t.locale)} · ${p.exposures(frame.n_exposures_used, frame.n_exposures_available)}`} />
        {shift && (
          <>
            {" · "}
            <span className="text-foreground tabular-nums">{shift}</span>
          </>
        )}
      </p>
      {compare && <p className="text-center text-xs text-muted-foreground">{p.compareHint}</p>}
      {markers && (measuredAt || predictedAt) && (
        <p className="flex flex-wrap justify-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
          {measuredAt && (
            <span className="flex items-center gap-1.5">
              <svg width="12" height="12" aria-hidden><circle cx="6" cy="6" r="4.5" fill="none" stroke={MEASURED} strokeWidth="2" /></svg>
              {p.markerMeasured}
            </span>
          )}
          {predictedAt && (
            <span className="flex items-center gap-1.5">
              <svg width="12" height="12" aria-hidden><rect x="3" y="3" width="6" height="6" transform="rotate(45 6 6)" fill="none" stroke={PREDICTED} strokeWidth="2" /></svg>
              {p.markerPredicted}
            </span>
          )}
        </p>
      )}
      <div className="rounded-xl border bg-card/70 backdrop-blur-sm p-5 text-sm text-muted-foreground">
        <p className="font-medium text-foreground">{object ? object.name : p.whatTitle}</p>
        {object ? (
          <dl className="mt-2 space-y-2">
            <dt className="font-medium text-primary">{p.whatIs}</dt>
            <dd><Gloss text={p.objects[object.index].what} /></dd>
            <dt className="font-medium text-primary">{p.whatChanges}</dt>
            <dd><Gloss text={p.objects[object.index].change} /></dd>
          </dl>
        ) : (
          <p className="mt-1"><Gloss text={p.whatText} /></p>
        )}
        {center && <p className="mt-2 text-xs"><Gloss text={p.coords} /></p>}
        <p id="player-keys" className="mt-2 text-xs">{p.keys}</p>
      </div>
    </div>
  );
}

export function Reticle({ uncertain }: { uncertain: boolean }) {
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
