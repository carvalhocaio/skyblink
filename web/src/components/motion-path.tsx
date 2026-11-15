"use client";

import { useState } from "react";
import { formatMonth, type Motion } from "@/lib/api";
import { useT } from "@/lib/i18n";

// Validated pair (dataviz validator, dark surface #0c111b): in band, CVD ΔE ≥ 19. Shape is the second encoding:
// measured = filled dot with error bars, predicted = hollow diamond on a dashed line.
const MEASURED = "#0891b2";
const PREDICTED = "#d97706";

const SIZE = 300;
const M = { l: 44, r: 12, t: 12, b: 40 };
const PLOT = SIZE - M.l - M.r; // square plot: 1″ is the same length on both axes
const STEPS = [0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 50];

/** The object's measured path across seasons against the catalog's prediction, east to the left as on the sky. */
export function MotionPath({ motion }: { motion: Motion }) {
  const { t } = useT();
  const c = t.path;
  const [hover, setHover] = useState<number | null>(null);
  const seasons = [...(motion.seasons ?? [])].sort((a, b) => a.mid_date.localeCompare(b.mid_date));
  if (seasons.length < 2) return null;

  const fmt = (x: number) => (Math.round(x * 10) / 10 + 0).toLocaleString(t.locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const err = (s: (typeof seasons)[number]) => [s.offset.east_err_arcsec ?? 0, s.offset.north_err_arcsec ?? 0];

  // Bounds over everything drawn (errors included), padded, then squared around their centre.
  const xs: number[] = [0], ys: number[] = [0];
  for (const s of seasons) {
    const [ee, ne] = err(s);
    xs.push(s.offset.east_arcsec - ee, s.offset.east_arcsec + ee);
    ys.push(s.offset.north_arcsec - ne, s.offset.north_arcsec + ne);
    if (s.predicted_offset) {
      xs.push(s.predicted_offset.east_arcsec);
      ys.push(s.predicted_offset.north_arcsec);
    }
  }
  const span = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys), 1) * 1.3;
  const cx = (Math.max(...xs) + Math.min(...xs)) / 2, cy = (Math.max(...ys) + Math.min(...ys)) / 2;
  const x0 = cx - span / 2, y0 = cy - span / 2;
  // East grows to the left (north up, east left), the way the sky and the player are drawn.
  const X = (east: number) => M.l + PLOT - ((east - x0) / span) * PLOT;
  const Y = (north: number) => M.t + PLOT - ((north - y0) / span) * PLOT;
  const step = STEPS.find((s) => span / s <= 6) ?? 100;
  const ticks = (lo: number) => {
    const out: number[] = [];
    for (let v = Math.ceil(lo / step) * step; v <= lo + span + 1e-9; v += step) out.push(Math.round(v / step) * step + 0); // + 0 turns −0 into 0, so no "−0.0" tick
    return out;
  };

  const predicted = seasons.filter((s) => s.predicted_offset);
  const line = (pts: [number, number][]) => pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const tip = hover === null ? null : seasons[hover];

  return (
    <figure className="space-y-3">
      <figcaption className="space-y-1">
        <span className="block font-medium">{c.title}</span>
        <span className="block text-muted-foreground">{c.text}</span>
      </figcaption>
      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <li className="flex items-center gap-2">
          <svg width="14" height="14" aria-hidden>
            <circle cx="7" cy="7" r="4.5" fill={MEASURED} />
          </svg>
          {c.measured}
        </li>
        {predicted.length > 0 && (
          <li className="flex items-center gap-2">
            <svg width="14" height="14" aria-hidden>
              <rect x="3.5" y="3.5" width="7" height="7" transform="rotate(45 7 7)" fill="none" stroke={PREDICTED} strokeWidth="2" />
            </svg>
            {c.predicted}
          </li>
        )}
      </ul>
      <div className="relative mx-auto w-full max-w-[360px]">
        <svg viewBox={`0 0 ${SIZE} ${SIZE}`} role="img" aria-label={c.label} className="block w-full overflow-visible">
          {/* Recessive grid and axes */}
          <g className="text-muted-foreground" fill="currentColor" fontSize="10">
            {ticks(x0).map((v) => (
              <g key={`x${v}`}>
                <line x1={X(v)} x2={X(v)} y1={M.t} y2={M.t + PLOT} stroke="currentColor" strokeOpacity={v === 0 ? 0.35 : 0.12} />
                <text x={X(v)} y={M.t + PLOT + 14} textAnchor="middle">{fmt(v)}</text>
              </g>
            ))}
            {ticks(y0).map((v) => (
              <g key={`y${v}`}>
                <line x1={M.l} x2={M.l + PLOT} y1={Y(v)} y2={Y(v)} stroke="currentColor" strokeOpacity={v === 0 ? 0.35 : 0.12} />
                <text x={M.l - 6} y={Y(v) + 3} textAnchor="end">{fmt(v)}</text>
              </g>
            ))}
            <text x={M.l + PLOT / 2} y={SIZE - 6} textAnchor="middle">{c.east}</text>
            <text x={10} y={M.t + PLOT / 2} textAnchor="middle" transform={`rotate(-90 10 ${M.t + PLOT / 2})`}>{c.north}</text>
          </g>

          {predicted.length > 1 && (
            <path d={line(predicted.map((s) => [X(s.predicted_offset!.east_arcsec), Y(s.predicted_offset!.north_arcsec)]))} fill="none" stroke={PREDICTED} strokeWidth="2" strokeDasharray="4 4" strokeOpacity="0.7" />
          )}
          <path d={line(seasons.map((s) => [X(s.offset.east_arcsec), Y(s.offset.north_arcsec)]))} fill="none" stroke={MEASURED} strokeWidth="2" strokeOpacity="0.6" />

          {predicted.map((s) => (
            <rect
              key={`p${s.frame_id}`}
              x={X(s.predicted_offset!.east_arcsec) - 4.5}
              y={Y(s.predicted_offset!.north_arcsec) - 4.5}
              width="9"
              height="9"
              transform={`rotate(45 ${X(s.predicted_offset!.east_arcsec)} ${Y(s.predicted_offset!.north_arcsec)})`}
              fill="var(--card)"
              stroke={PREDICTED}
              strokeWidth="2"
            />
          ))}

          {seasons.map((s, i) => {
            const x = X(s.offset.east_arcsec), y = Y(s.offset.north_arcsec);
            const [ee, ne] = err(s);
            return (
              <g key={s.frame_id}>
                <g stroke={MEASURED} strokeWidth="1.5" strokeOpacity="0.8">
                  {ee > 0 && <line x1={X(s.offset.east_arcsec - ee)} x2={X(s.offset.east_arcsec + ee)} y1={y} y2={y} />}
                  {ne > 0 && <line x1={x} x2={x} y1={Y(s.offset.north_arcsec - ne)} y2={Y(s.offset.north_arcsec + ne)} />}
                </g>
                <circle cx={x} cy={y} r={hover === i ? 6 : 4.5} fill={MEASURED} stroke="var(--card)" strokeWidth="2" />
                <text x={x + 9} y={y + 4} fontSize="10" className="fill-foreground">{formatMonth(s.mid_date, t.locale)}</text>
                {/* Hit target larger than the mark; focusable so the readout works from the keyboard too. */}
                <circle
                  cx={x}
                  cy={y}
                  r="14"
                  fill="transparent"
                  tabIndex={0}
                  aria-label={`${formatMonth(s.mid_date, t.locale)}: ${c.tip(fmt(s.offset.east_arcsec), fmt(s.offset.north_arcsec))}`}
                  onPointerEnter={() => setHover(i)}
                  onPointerLeave={() => setHover(null)}
                  onFocus={() => setHover(i)}
                  onBlur={() => setHover(null)}
                  className="outline-none"
                />
              </g>
            );
          })}
        </svg>
        {tip && (
          <div
            role="tooltip"
            className="pointer-events-none absolute z-10 w-max max-w-[220px] -translate-x-1/2 -translate-y-full rounded-lg border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-xl"
            style={{ left: `${(X(tip.offset.east_arcsec) / SIZE) * 100}%`, top: `calc(${(Y(tip.offset.north_arcsec) / SIZE) * 100}% - 12px)` }}
          >
            <b className="block">{formatMonth(tip.mid_date, t.locale)}</b>
            {tip.season_id === motion.reference_season_id ? (
              <span className="block text-muted-foreground">{c.reference}</span>
            ) : (
              <>
                <span className="block tabular-nums">{c.tip(fmt(tip.offset.east_arcsec), fmt(tip.offset.north_arcsec))}</span>
                <span className="block text-muted-foreground tabular-nums">± {fmt(err(tip)[0])}″, ± {fmt(err(tip)[1])}″</span>
              </>
            )}
            {tip.predicted_offset && (
              <span className="block text-muted-foreground tabular-nums">{c.tipPredicted(fmt(tip.predicted_offset.east_arcsec), fmt(tip.predicted_offset.north_arcsec))}</span>
            )}
          </div>
        )}
      </div>
    </figure>
  );
}
