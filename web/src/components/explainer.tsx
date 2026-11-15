"use client";

// "How it works" as five short animated scenes drawn in SPHEREx-style pixels,
// so a visitor knows what the Explore player is showing before they use it.
import { useEffect, useState } from "react";
import { ArrowRight, ChevronRight, Pause, Play } from "lucide-react";
import { useT } from "@/lib/i18n";
import { formatMonth } from "@/lib/api";

function useDates() {
  const { t } = useT();
  return SEASONS.map((d) => formatMonth(d, t.locale));
}

const SCENE_MS = 6500;
// Mid-dates of the three SPHEREx seasons used in the demo frames.
const SEASONS = ["2025-08-15", "2026-04-15", "2026-09-15"];
// Faraway stars: identical in every frame. [x, y, brightness]
const FAR: [number, number, number][] = [
  [30, 30, 0.5], [70, 150, 0.35], [95, 60, 0.7], [130, 25, 0.4], [210, 40, 0.55], [250, 90, 0.3],
  [280, 160, 0.6], [45, 105, 0.3], [222, 178, 0.45], [300, 30, 0.4], [105, 135, 0.3], [235, 140, 0.5],
];
// The nearby star walks five pixels per season (exaggerated so the drift reads at a glance).
const NEAR_X = [135, 160, 185];
const NEAR_Y = 95;
const CYAN = "#22d3ee";

function FarStars() {
  return (
    <>
      {FAR.map(([x, y, a]) => (
        <g key={`${x},${y}`}>
          <rect x={x - 5} y={y - 5} width={15} height={15} fill="white" opacity={a * 0.12} />
          <rect x={x} y={y} width={5} height={5} fill="white" opacity={a} />
        </g>
      ))}
    </>
  );
}

function NearStar({ x, y = NEAR_Y }: { x: number; y?: number }) {
  return (
    <g>
      <rect x={x - 10} y={y - 10} width={25} height={25} fill="white" opacity={0.1} />
      <rect x={x - 5} y={y - 5} width={15} height={15} fill="white" opacity={0.45} />
      <rect x={x} y={y} width={5} height={5} fill="white" />
      <rect x={x - 5} y={y} width={15} height={5} fill="white" opacity={0.85} />
      <rect x={x} y={y - 5} width={5} height={15} fill="white" opacity={0.85} />
    </g>
  );
}

function Crosshair({ x = NEAR_X[0] + 2.5, y = NEAR_Y + 2.5 }: { x?: number; y?: number }) {
  return (
    <g stroke={CYAN} strokeWidth={1.4}>
      <line x1={x} y1={y - 26} x2={x} y2={y - 14} />
      <line x1={x} y1={y + 14} x2={x} y2={y + 26} />
      <line x1={x - 26} y1={y} x2={x - 14} y2={y} />
      <line x1={x + 14} y1={y} x2={x + 26} y2={y} />
    </g>
  );
}

/** Three season frames that take turns, like the Explore player. */
function Flipbook({ season }: { season: string }) {
  const DATES = useDates();
  return (
    <>
      <FarStars />
      {NEAR_X.map((x, k) => (
        <g key={x} className={`ex-frame ex-frame-${k}`}>
          <NearStar x={x} />
          <text x={10} y={16} className="ex-label" fill="white">
            {season} {k + 1} · {DATES[k]}
          </text>
        </g>
      ))}
    </>
  );
}

function Scene({ i }: { i: number }) {
  const { t } = useT();
  const L = t.how.labels;
  const DATES = useDates();
  if (i === 0)
    return (
      <>
        <g opacity={0.5}>
          <FarStars />
        </g>
        <circle cx={160} cy={100} r={60} fill="none" stroke="white" strokeOpacity={0.15} strokeDasharray="3 4" />
        <circle cx={160} cy={100} r={26} fill="#1e40af" />
        <path d="M140 88c8-6 18-4 22 2s14 4 18 10c-6 14-22 18-34 12-8-4-10-16-6-24z" fill="#16a34a" opacity={0.8} />
        <circle cx={160} cy={100} r={26} fill="none" stroke="#93c5fd" strokeOpacity={0.5} />
        <g className="ex-orbit">
          <circle cx={160} cy={40} r={16} fill={CYAN} className="ex-flash" />
          <rect x={155} y={37} width={10} height={6} fill="#e5e7eb" />
          <rect x={145} y={38} width={8} height={4} fill={CYAN} />
          <rect x={167} y={38} width={8} height={4} fill={CYAN} />
        </g>
        {DATES.map((d, k) => (
          <text key={d} x={60 + k * 100} y={188} textAnchor="middle" className="ex-label ex-pop" style={{ animationDelay: `${0.4 + k * 1.1}s` }} fill="white">
            {d}
          </text>
        ))}
      </>
    );
  if (i === 1)
    return (
      <>
        {DATES.map((d, k) => (
          <g key={d} className="ex-card" style={{ animationDelay: `${0.2 + k * 0.5}s` }}>
            <rect x={14 + k * 101} y={48} width={90} height={70} rx={3} fill="black" stroke="white" strokeOpacity={0.25} />
            <svg x={14 + k * 101} y={48} width={90} height={70} viewBox="0 0 320 200">
              <FarStars />
              <NearStar x={NEAR_X[k]} />
            </svg>
            <text x={59 + k * 101} y={136} textAnchor="middle" className="ex-label" fill="white">
              {L.season} {k + 1}
            </text>
            <text x={59 + k * 101} y={150} textAnchor="middle" className="ex-label" fill="white" opacity={0.55}>
              {d}
            </text>
          </g>
        ))}
      </>
    );
  if (i === 2)
    return (
      <>
        <Flipbook season={L.season} />
        <rect x={12} y={167} width={6} height={6} fill="white" opacity={0.7} />
        <text x={24} y={173} className="ex-label" fill="white" opacity={0.75}>
          {L.far}
        </text>
        <rect x={12} y={181} width={6} height={6} fill="white" />
        <text x={24} y={187} className="ex-label" fill="white">
          {L.near}
        </text>
      </>
    );
  if (i === 3)
    return (
      <>
        <Flipbook season={L.season} />
        <line x1={NEAR_X[0] + 2.5} y1={NEAR_Y + 2.5} x2={NEAR_X[2] + 2.5} y2={NEAR_Y + 2.5} stroke="#fcd34d" strokeWidth={1.5} strokeDasharray="3 3" className="ex-trail" />
        <Crosshair />
        <text x={NEAR_X[1] + 2.5} y={NEAR_Y - 34} textAnchor="middle" className="ex-label" fill="#fcd34d">
          {L.trail}
        </text>
        <text x={NEAR_X[0] + 2.5} y={NEAR_Y + 44} textAnchor="middle" className="ex-label" fill={CYAN}>
          {L.spot}
        </text>
      </>
    );
  return (
    <>
      <FarStars />
      <g className="ex-pulse">
        <NearStar x={160} />
      </g>
      <Crosshair x={162.5} />
      <text x={162.5} y={NEAR_Y + 44} textAnchor="middle" className="ex-label ex-bright" fill="white">
        {L.bright}
      </text>
      <text x={162.5} y={NEAR_Y + 44} textAnchor="middle" className="ex-label ex-dim" fill="white" opacity={0}>
        {L.dim}
      </text>
    </>
  );
}

export function Explainer() {
  const { t } = useT();
  const h = t.how;
  const [scene, setScene] = useState(0);
  const [playing, setPlaying] = useState(true);
  const n = h.scenes.length;

  useEffect(() => {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) setPlaying(false); // eslint-disable-line react-hooks/set-state-in-effect -- media query exists only in the browser
  }, []);

  useEffect(() => {
    if (!playing) return;
    const id = setTimeout(() => setScene((s) => (s + 1) % n), SCENE_MS);
    return () => clearTimeout(id);
  }, [scene, playing, n]);

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)] lg:items-start">
      <div className="relative overflow-hidden rounded-xl border bg-black shadow-[0_0_80px_-30px_oklch(0.85_0.13_205/0.5)]">
        <span className="absolute top-2 right-2 z-10 rounded-full border border-white/15 bg-black/70 px-2.5 py-1 font-mono text-[10px] tracking-widest text-white/70 uppercase">{h.illustration}</span>
        <svg key={scene} viewBox="0 0 320 200" className="ex-scene block w-full" role="img" aria-label={`${h.scenes[scene].title}. ${h.scenes[scene].text}`}>
          <Scene i={scene} />
        </svg>
      </div>

      <div>
        <ol className="space-y-2">
          {h.scenes.map((s, i) => {
            const on = i === scene;
            return (
              <li key={i}>
                <button
                  type="button"
                  aria-current={on ? "step" : undefined}
                  onClick={() => {
                    setScene(i);
                    setPlaying(false);
                  }}
                  className={`w-full rounded-xl border p-4 text-left transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50 ${
                    on ? "border-primary/40 bg-card/80" : "border-transparent hover:bg-white/5"
                  }`}
                >
                  <span className="flex items-baseline gap-3">
                    <span className={`font-mono text-xs tabular-nums ${on ? "text-primary" : "text-muted-foreground"}`}>0{i + 1}</span>
                    <span className={`font-medium ${on ? "" : "text-muted-foreground"}`}>{s.title}</span>
                  </span>
                  {on && (
                    <>
                      <span className="mt-2 block pl-7 text-sm leading-relaxed text-muted-foreground">{s.text}</span>
                      <span aria-hidden className="mt-3 ml-7 block h-0.5 overflow-hidden rounded-full bg-white/10">
                        <span
                          key={`${scene}-${playing}`}
                          className={`block h-full bg-primary ${playing ? "ex-progress" : "w-full"}`}
                          style={{ animationDuration: `${SCENE_MS}ms` }}
                        />
                      </span>
                    </>
                  )}
                </button>
                {on && i === n - 1 && (
                  <details className="group mt-2 ml-11 text-sm" onToggle={(e) => e.currentTarget.open && setPlaying(false)}>
                    <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 text-primary hover:underline [&::-webkit-details-marker]:hidden">
                      <ChevronRight className="size-4 transition-transform group-open:rotate-90" aria-hidden />
                      {h.more.summary}
                    </summary>
                    <dl className="mt-2 space-y-3 rounded-xl border bg-card/60 p-4">
                      {h.more.items.map((x) => (
                        <div key={x.title}>
                          <dt className="font-medium">{x.title}</dt>
                          <dd className="mt-1 leading-relaxed text-muted-foreground">{x.text}</dd>
                        </div>
                      ))}
                    </dl>
                  </details>
                )}
              </li>
            );
          })}
        </ol>
        <div className="mt-5 flex flex-wrap items-center gap-3 pl-4">
          <button
            type="button"
            onClick={() => setPlaying((p) => !p)}
            aria-label={playing ? h.pause : h.play}
            className="flex size-11 items-center justify-center rounded-full border transition hover:border-white/30 hover:bg-white/5"
          >
            {playing ? <Pause className="size-4" aria-hidden /> : <Play className="size-4" aria-hidden />}
          </button>
          <a href="#explore" className="inline-flex min-h-11 items-center gap-2 rounded-full bg-primary px-5 text-sm font-medium text-primary-foreground transition hover:-translate-y-0.5">
            {h.cta} <ArrowRight className="size-4" aria-hidden />
          </a>
        </div>
      </div>
    </div>
  );
}
