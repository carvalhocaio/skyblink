"use client";

import { ChevronRight, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatMonth, type Frame, type Job, type SeasonMotion } from "@/lib/api";
import { useT } from "@/lib/i18n";

const day = (iso: string) => iso.slice(0, 10);

/** The CSV columns: one row per picture, with its season's measured and predicted position when there is one. */
function toCsv(frames: Frame[], bySeason: Map<string, SeasonMotion>): string {
  const head = [
    "frame_id", "mid_date", "detector", "wavelength_lo_um", "wavelength_hi_um", "status", "n_exposures_used", "n_exposures_available", "alerts",
    "peak_snr", "east_arcsec", "east_err_arcsec", "north_arcsec", "north_err_arcsec", "total_arcsec", "total_err_arcsec",
    "stat_err_east_arcsec", "stat_err_north_arcsec", "align_err_east_arcsec", "align_err_north_arcsec",
    "predicted_east_arcsec", "predicted_north_arcsec", "residual_sigma", "drift_corrected",
  ];
  const rows = frames.map((f) => {
    const m = bySeason.get(f.id);
    const o = m?.offset;
    return [
      f.id, f.mid_date, f.detector, f.wavelength_um[0], f.wavelength_um[1], f.status, f.n_exposures_used, f.n_exposures_available, f.alerts.map((a) => a.code).join(" "),
      m?.peak_snr, o?.east_arcsec, o?.east_err_arcsec, o?.north_arcsec, o?.north_err_arcsec, o?.total_arcsec, o?.total_err_arcsec,
      o?.error_components?.statistical.east_arcsec, o?.error_components?.statistical.north_arcsec,
      o?.error_components?.alignment.east_arcsec, o?.error_components?.alignment.north_arcsec,
      m?.predicted_offset?.east_arcsec, m?.predicted_offset?.north_arcsec, m?.residual_sigma, m?.drift_corrected,
    ].map((v) => (v === undefined || v === null ? "" : String(v)));
  });
  return [head, ...rows].map((r) => r.join(",")).join("\n") + "\n";
}

function save(name: string, type: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = Object.assign(document.createElement("a"), { href: url, download: name });
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Everything the API returned for this view, as tables and downloads, closed by default. */
export function DataDrawer({ job, frames, name }: { job: Job; frames: Frame[]; name?: string }) {
  const { t } = useT();
  const d = t.data;
  if (job.status !== "done" || frames.length === 0) return null;

  const n = (x: number | null | undefined, digits = 2) =>
    x === undefined || x === null ? "–" : (Math.round(x * 10 ** digits) / 10 ** digits + 0).toLocaleString(t.locale, { minimumFractionDigits: digits, maximumFractionDigits: digits });
  const pm = (x: number | null | undefined) => n(x, 1);
  const windows = new Map(job.seasons.map((s) => [s.id, `${day(s.start)} – ${day(s.end)}`]));
  const motion = job.motion;
  const bySeason = new Map((motion?.seasons ?? []).map((s) => [s.frame_id, s]));
  const cat = motion?.catalog;
  const file = `skyblink-${(name ?? `${job.target.ra}_${job.target.dec}`).replace(/[^\w.+-]+/g, "_")}`;

  const th = "px-3 py-2 text-left font-medium whitespace-nowrap";
  const td = "px-3 py-2 whitespace-nowrap tabular-nums";

  return (
    <details className="group rounded-xl border bg-card/70 text-sm backdrop-blur-sm">
      <summary className="flex min-h-12 cursor-pointer list-none items-center gap-2 px-5 font-medium [&::-webkit-details-marker]:hidden">
        <ChevronRight className="size-4 text-muted-foreground transition-transform group-open:rotate-90" aria-hidden />
        {d.summary}
      </summary>
      <div className="space-y-6 border-t px-5 py-5">
        <p className="text-muted-foreground">{d.hint}</p>

        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={() => save(`${file}.json`, "application/json", JSON.stringify(job, null, 2))}>
            <Download aria-hidden /> {d.json}
          </Button>
          <Button size="sm" variant="outline" onClick={() => save(`${file}.csv`, "text/csv", toCsv(frames, bySeason))}>
            <Download aria-hidden /> {d.csv}
          </Button>
        </div>

        <dl className="grid grid-cols-3 gap-3 text-xs">
          <div><dt className="text-muted-foreground">RA</dt><dd className="mt-0.5 tabular-nums">{n(job.target.ra, 4)}°</dd></div>
          <div><dt className="text-muted-foreground">Dec</dt><dd className="mt-0.5 tabular-nums">{n(job.target.dec, 4)}°</dd></div>
          <div><dt className="text-muted-foreground">{d.fov}</dt><dd className="mt-0.5 tabular-nums">{n(job.target.fov_arcmin, 0)}</dd></div>
        </dl>

        <div className="space-y-2">
          <h4 className="font-medium">{d.pictures}</h4>
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-xs">
              <thead className="bg-white/5 text-muted-foreground">
                <tr>
                  <th className={th}>{d.date}</th>
                  <th className={th}>{d.window}</th>
                  <th className={th}>{d.detector}</th>
                  <th className={th}>{d.exposures}</th>
                  <th className={th}>{d.status}</th>
                  <th className={th}>{d.alerts}</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {frames.map((f) => (
                  <tr key={f.id}>
                    <td className={td}>{day(f.mid_date)}</td>
                    <td className={td}>{windows.get(f.season_id) ?? "–"}</td>
                    <td className={td}>{f.detector} · {n(f.wavelength_um[0])}–{n(f.wavelength_um[1])} µm</td>
                    <td className={td}>{f.n_exposures_used} / {f.n_exposures_available}</td>
                    <td className={td}>{f.status}</td>
                    <td className={td}>{f.alerts.map((a) => a.code).join(", ") || "–"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {motion && (motion.seasons?.length ?? 0) > 0 && (
          <div className="space-y-2">
            <h4 className="font-medium">{d.positions}</h4>
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full text-xs">
                <thead className="bg-white/5 text-muted-foreground">
                  <tr>
                    <th className={th}>{d.date}</th>
                    <th className={th}>{d.snr}</th>
                    <th className={th}>{d.east}</th>
                    <th className={th}>{d.north}</th>
                    <th className={th}>{d.total}</th>
                    <th className={th}>{d.noise}</th>
                    <th className={th}>{d.alignment}</th>
                    <th className={th}>{d.predicted}</th>
                    <th className={th}>{d.residual}</th>
                    <th className={th}>{d.corrected}</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {motion.seasons!.map((s) => {
                    const o = s.offset, ec = o.error_components;
                    return (
                      <tr key={s.frame_id}>
                        <td className={td}>{formatMonth(s.mid_date, t.locale)}</td>
                        <td className={td}>{n(s.peak_snr, 0)}</td>
                        <td className={td}>{n(o.east_arcsec)} ± {n(o.east_err_arcsec)}</td>
                        <td className={td}>{n(o.north_arcsec)} ± {n(o.north_err_arcsec)}</td>
                        <td className={td}>{n(o.total_arcsec)} ± {n(o.total_err_arcsec)}</td>
                        <td className={td}>{ec ? `${n(ec.statistical.east_arcsec)}, ${n(ec.statistical.north_arcsec)}` : "–"}</td>
                        <td className={td}>{ec ? `${n(ec.alignment.east_arcsec)}, ${n(ec.alignment.north_arcsec)}` : "–"}</td>
                        <td className={td}>{s.predicted_offset ? `${n(s.predicted_offset.east_arcsec)}, ${n(s.predicted_offset.north_arcsec)}` : "–"}</td>
                        <td className={td}>{n(s.residual_sigma)}</td>
                        <td className={td}>{s.drift_corrected === undefined ? "–" : s.drift_corrected ? d.yes : d.no}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {motion && (
          <div className="space-y-2">
            <h4 className="font-medium">{d.catalog}</h4>
            <dl className="grid gap-x-6 gap-y-2 text-xs sm:grid-cols-2">
              <Row k={d.rateMeasured} v={`${n(motion.rate_arcsec_yr.value)} ± ${n(motion.rate_arcsec_yr.error)}`} />
              {cat && (
                <>
                  <Row k={d.ratePredicted} v={n(cat.predicted_rate_arcsec_yr)} />
                  <Row k={d.residual} v={n(cat.rate_residual_sigma)} />
                  <Row k={d.object} v={`${cat.object} (${cat.name})`} />
                  <Row k={d.coords} v={cat.coordinates_source ?? "–"} />
                  <Row k={d.pm} v={`${pm(cat.pmra_mas_yr)}, ${pm(cat.pmdec_mas_yr)}`} />
                  <Row k={d.parallax} v={n(cat.parallax_mas)} />
                  <Row k={d.rv} v={n(cat.radial_velocity_km_s)} />
                </>
              )}
            </dl>
          </div>
        )}

        <p className="text-xs text-muted-foreground">{d.notes}</p>
        <p className="text-xs text-muted-foreground">{d.source}</p>
      </div>
    </details>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-4 border-b border-white/5 pb-1.5">
      <dt className="text-muted-foreground">{k}</dt>
      <dd className="text-right tabular-nums">{v}</dd>
    </div>
  );
}
