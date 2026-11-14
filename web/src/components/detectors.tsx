"use client";

// "A rainbow you can't see" as an animated tour: one scene for how six detectors make 102 colors,
// then one scene per detector showing what that slice of infrared reveals.
import { useEffect, useState } from "react";
import { Pause, Play } from "lucide-react";
import { useT } from "@/lib/i18n";

const SCENE_MS = 8000;
export const DETECTORS = [
  { id: "D1", lo: 0.75, hi: 1.09, color: "#7c3aed" },
  { id: "D2", lo: 1.1, hi: 1.62, color: "#2563eb" },
  { id: "D3", lo: 1.63, hi: 2.41, color: "#0891b2" },
  { id: "D4", lo: 2.42, hi: 3.82, color: "#059669" },
  { id: "D5", lo: 3.83, hi: 4.41, color: "#ca8a04" },
  { id: "D6", lo: 4.42, hi: 5.0, color: "#dc2626" },
];
const fmt = (n: number, locale: string) => n.toLocaleString(locale, { minimumFractionDigits: 2 });

// Graph area for the spectrum scenes.
const GX0 = 30, GX1 = 290, GY = 70;

/** A starlight spectrum across the detector's range with an absorption dip at `at` µm. */
function spectrum(lo: number, hi: number, at: number, width: number, depth = 46) {
  const xd = GX0 + ((at - lo) / (hi - lo)) * (GX1 - GX0);
  const pts: string[] = [];
  for (let x = GX0; x <= GX1; x += 3) {
    const y = GY + 6 * Math.sin(x / 31) + depth * Math.exp(-(((x - xd) / width) ** 2));
    pts.push(`${x},${y.toFixed(1)}`);
  }
  return { d: `M${pts.join(" L")}`, xd };
}

function Molecule({ atoms, x, y }: { atoms: [number, number, number, string][]; x: number; y: number }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <g className="ex-bob">
        {atoms.slice(1).map(([ax, ay], k) => (
          <line key={k} x1={atoms[0][0]} y1={atoms[0][1]} x2={ax} y2={ay} stroke="white" strokeOpacity={0.5} strokeWidth={2} />
        ))}
        {atoms.map(([ax, ay, r, c], k) => (
          <circle key={k} cx={ax} cy={ay} r={r} fill={c} />
        ))}
      </g>
    </g>
  );
}
const O = "#ef4444", H = "#f8fafc", C = "#64748b";
const WATER: [number, number, number, string][] = [[0, 0, 7, O], [-9, 7, 4, H], [9, 7, 4, H]];
const CO2: [number, number, number, string][] = [[0, 0, 6, C], [-13, 0, 6, O], [13, 0, 6, O]];
const CO: [number, number, number, string][] = [[0, 0, 6, C], [13, 0, 6, O]];

function Feature({ k, at, width, label, mol }: { k: number; at: number; width: number; label: string; mol: typeof WATER }) {
  const { t } = useT();
  const d = DETECTORS[k];
  const s = spectrum(d.lo, d.hi, at, width);
  return (
    <>
      <line x1={GX0} y1={122} x2={GX1} y2={122} stroke="white" strokeOpacity={0.2} />
      <text x={GX0} y={134} className="ex-label" fill="white" opacity={0.5}>{fmt(d.lo, t.locale)} µm</text>
      <text x={GX1} y={134} textAnchor="end" className="ex-label" fill="white" opacity={0.5}>{fmt(d.hi, t.locale)} µm</text>
      <path d={s.d} pathLength={1} fill="none" stroke={d.color} strokeWidth={2.2} className="ex-draw" />
      <line x1={s.xd} y1={20} x2={s.xd} y2={122} stroke="white" strokeOpacity={0.45} strokeDasharray="2 3" className="ex-pop" style={{ animationDelay: "1.4s" }} />
      <text x={s.xd} y={16} textAnchor="middle" className="ex-label ex-pop" style={{ animationDelay: "1.6s" }} fill="white">
        {label} · {fmt(at, t.locale)} µm
      </text>
      <Molecule atoms={mol} x={GX1 - 18} y={42} />
    </>
  );
}

function Scene({ i }: { i: number }) {
  const { t } = useT();
  if (i === 0)
    return (
      <>
        <defs>
          <linearGradient id="det-filter" x1="0" y1="0" x2="0" y2="1">
            {DETECTORS.map((d, k) => (
              <stop key={d.id} offset={k / 5} stopColor={d.color} />
            ))}
          </linearGradient>
          {DETECTORS.map((d) => (
            <linearGradient key={d.id} id={`det-${d.id}`} x1="0" y1="0" x2="1" y2="0">
              <stop offset="0" stopColor={d.color} stopOpacity={0.35} />
              <stop offset="1" stopColor={d.color} />
            </linearGradient>
          ))}
          <pattern id="det-stripes" width={16 / 17} height={4} patternUnits="userSpaceOnUse">
            <rect width={0.35} height={4} fill="black" opacity={0.55} />
          </pattern>
        </defs>
        <line x1={8} y1={70} x2={92} y2={70} stroke="white" strokeWidth={3} className="ex-flow" />
        <rect x={92} y={22} width={14} height={96} rx={2} fill="url(#det-filter)" />
        {DETECTORS.map((d, k) => {
          const y = 14 + k * 20;
          return (
            <g key={d.id}>
              <line x1={106} y1={24 + k * 18.4} x2={232} y2={y + 8} stroke={d.color} strokeWidth={1.6} className="ex-flow" style={{ animationDelay: `${-k * 0.15}s` }} />
              <g className="ex-pop" style={{ animationDelay: `${0.2 + k * 0.15}s` }}>
                <rect x={234} y={y} width={48} height={16} fill={`url(#det-${d.id})`} />
                <rect x={234} y={y} width={48} height={16} fill="url(#det-stripes)" />
                <text x={290} y={y + 11} className="ex-label" fill="white">{d.id}</text>
              </g>
            </g>
          );
        })}
        <text x={8} y={60} className="ex-label" fill="white" opacity={0.6}>{t.about.det.all}</text>
        <text x={165} y={140} textAnchor="middle" className="ex-label ex-pop" style={{ animationDelay: "1.4s" }} fill="white">
          6 × 17 = 102
        </text>
      </>
    );
  if (i === 1)
    return (
      <>
        {[[40, 30], [70, 95], [150, 25], [180, 110], [265, 40], [290, 105], [120, 70], [240, 120]].map(([x, y], k) => (
          <path
            key={k}
            d={`M${x} ${y - 6}L${x + 1.5} ${y - 1.5}L${x + 6} ${y}L${x + 1.5} ${y + 1.5}L${x} ${y + 6}L${x - 1.5} ${y + 1.5}L${x - 6} ${y}L${x - 1.5} ${y - 1.5}Z`}
            fill="white"
            className="ex-twinkle"
            style={{ animationDelay: `${-k * 0.37}s` }}
          />
        ))}
        <circle cx={95} cy={62} r={16} fill="#fff7d6" className="ex-breathe" />
        <circle cx={95} cy={62} r={26} fill="#fde68a" opacity={0.15} />
        <g transform="rotate(-25 215 75)">
          <ellipse cx={215} cy={75} rx={36} ry={11} fill="#c4b5fd" opacity={0.25} />
          <ellipse cx={215} cy={75} rx={18} ry={6} fill="#ede9fe" opacity={0.6} />
          <circle cx={215} cy={75} r={3.5} fill="white" />
        </g>
      </>
    );
  if (i === 2)
    return (
      <>
        <circle cx={160} cy={70} r={30} fill="#bfdbfe" opacity={0.18} />
        <circle cx={160} cy={70} r={9} fill="white" />
        <g className="ex-veil">
          {[[130, 60, 34], [168, 48, 30], [190, 78, 32], [150, 92, 30], [118, 85, 24]].map(([x, y, r], k) => (
            <circle key={k} cx={x} cy={y} r={r} fill="#6b4f3a" opacity={0.85} />
          ))}
        </g>
      </>
    );
  if (i === 3)
    return (
      <>
        <line x1={GX0} y1={122} x2={GX1} y2={122} stroke="white" strokeOpacity={0.2} />
        <g className="ex-shift">
          <path
            d={spectrum(0, 1, 0.35, 40, -40).d}
            fill="none"
            stroke="#22d3ee"
            strokeWidth={2.2}
            transform="translate(-12 18)"
          />
        </g>
        <g transform="rotate(-20 60 30)">
          <ellipse cx={60} cy={30} rx={22} ry={7} className="ex-redden" />
          <circle cx={60} cy={30} r={2.5} fill="white" />
        </g>
        <text x={GX1} y={18} textAnchor="end" className="ex-label" fill="#f87171">{t.about.det.redshift} →</text>
        <text x={GX0} y={134} className="ex-label" fill="white" opacity={0.5}>{t.about.shorter}</text>
        <text x={GX1} y={134} textAnchor="end" className="ex-label" fill="white" opacity={0.5}>{t.about.longer}</text>
      </>
    );
  if (i === 4) return <Feature k={3} at={3.0} width={26} label="H₂O" mol={WATER} />;
  if (i === 5) return <Feature k={4} at={4.27} width={9} label="CO₂" mol={CO2} />;
  return (
    <>
      <Feature k={5} at={4.67} width={8} label="CO" mol={CO} />
      <circle cx={60} cy={30} r={11} fill="#b45309" className="ex-breathe" />
      <circle cx={60} cy={30} r={18} fill="#dc2626" opacity={0.2} className="ex-breathe" />
      <text x={60} y={57} textAnchor="middle" className="ex-label" fill="white" opacity={0.7}>{t.about.det.dwarf}</text>
    </>
  );
}

/** The six-detector strip under every scene; the active one lights up. */
function Strip({ active }: { active: number }) {
  const { t } = useT();
  return (
    <>
      {DETECTORS.map((d, k) => {
        const on = active < 0 || active === k;
        return (
          <g key={d.id}>
            <rect x={16 + k * 48} y={158} width={46} height={10} rx={1.5} fill={d.color} opacity={on ? 1 : 0.22} className={active < 0 ? "ex-pop" : ""} style={{ animationDelay: `${k * 0.12}s` }} />
            <text x={39 + k * 48} y={181} textAnchor="middle" className="ex-label" fill="white" opacity={on ? 1 : 0.4}>
              {d.id}
            </text>
          </g>
        );
      })}
      <text x={160} y={151} textAnchor="middle" className="ex-label" fill="white" opacity={0.8}>
        {active < 0 ? `${fmt(0.75, t.locale)}–${fmt(5, t.locale)} µm` : `${fmt(DETECTORS[active].lo, t.locale)}–${fmt(DETECTORS[active].hi, t.locale)} µm`}
      </text>
      <text x={16} y={195} className="ex-label" fill="white" opacity={0.45}>← {t.about.shorter}</text>
      <text x={304} y={195} textAnchor="end" className="ex-label" fill="white" opacity={0.45}>{t.about.longer} →</text>
    </>
  );
}

export function Detectors() {
  const { t } = useT();
  const a = t.about;
  const steps = a.det.steps;
  const [scene, setScene] = useState(0);
  const [playing, setPlaying] = useState(true);
  const n = steps.length;

  useEffect(() => {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) setPlaying(false); // eslint-disable-line react-hooks/set-state-in-effect -- media query exists only in the browser
  }, []);

  useEffect(() => {
    if (!playing) return;
    const id = setTimeout(() => setScene((s) => (s + 1) % n), SCENE_MS);
    return () => clearTimeout(id);
  }, [scene, playing, n]);

  const label = (i: number) => (i === 0 ? a.det.all : DETECTORS[i - 1].id);
  const range = (i: number) =>
    i === 0 ? `${fmt(0.75, t.locale)}–${fmt(5, t.locale)} µm` : `${fmt(DETECTORS[i - 1].lo, t.locale)}–${fmt(DETECTORS[i - 1].hi, t.locale)} µm`;

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] lg:items-start">
      <div className="space-y-4 lg:sticky lg:top-6">
        <div className="overflow-hidden rounded-xl border bg-black shadow-[0_0_80px_-30px_oklch(0.85_0.13_205/0.5)]">
          <svg key={scene} viewBox="0 0 320 200" className="ex-scene block w-full" role="img" aria-label={`${label(scene)}, ${range(scene)}. ${steps[scene].title}. ${steps[scene].text}`}>
            <Scene i={scene} />
            <Strip active={scene - 1} />
          </svg>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => setPlaying((p) => !p)}
            aria-label={playing ? a.det.pause : a.det.play}
            className="flex size-11 items-center justify-center rounded-full border transition hover:border-white/30 hover:bg-white/5"
          >
            {playing ? <Pause className="size-4" aria-hidden /> : <Play className="size-4" aria-hidden />}
          </button>
          <div role="group" aria-label={a.detectors} className="flex flex-wrap gap-1.5">
            {steps.map((_, i) => (
              <button
                key={i}
                type="button"
                aria-pressed={i === scene}
                onClick={() => {
                  setScene(i);
                  setPlaying(false);
                }}
                style={{ "--c": i ? DETECTORS[i - 1].color : "var(--primary)" } as React.CSSProperties}
                className={`min-h-11 min-w-11 rounded-full border px-3 font-mono text-xs font-semibold transition hover:-translate-y-0.5 ${
                  i === scene ? "border-(--c) bg-(--c)/25 text-foreground" : "hover:border-white/30"
                }`}
              >
                {label(i)}
              </button>
            ))}
          </div>
        </div>
        <p className="text-xs text-muted-foreground">{a.colorNote}</p>
      </div>

      <div className="rounded-xl border bg-card/70 p-6 backdrop-blur-sm" style={{ "--c": scene ? DETECTORS[scene - 1].color : "var(--primary)" } as React.CSSProperties}>
        <p className="flex items-center gap-3 font-mono text-xs tracking-widest uppercase">
          <span className="rounded-full border border-(--c) bg-(--c)/25 px-2.5 py-1 font-semibold text-foreground">
            {label(scene)}
          </span>
          <span className="text-muted-foreground normal-case">{range(scene)}</span>
        </p>
        <h4 className="mt-4 text-xl font-medium tracking-tight">{steps[scene].title}</h4>
        <p className="mt-3 leading-relaxed text-muted-foreground">{steps[scene].text}</p>
        <p className="mt-4 border-t pt-4 text-sm">
          <span className="font-mono text-[11px] tracking-widest text-primary uppercase">{a.det.good}</span>
          <br />
          {steps[scene].good}
        </p>
        <span aria-hidden className="mt-5 block h-0.5 overflow-hidden rounded-full bg-white/10">
          <span key={`${scene}-${playing}`} className={`block h-full bg-primary ${playing ? "ex-progress" : "w-full"}`} style={{ animationDuration: `${SCENE_MS}ms` }} />
        </span>
      </div>
    </div>
  );
}
