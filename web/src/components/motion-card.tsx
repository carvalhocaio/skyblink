"use client";

import { useEffect } from "react";
import type { Job } from "@/lib/api";
import { useEggs } from "@/lib/eggs";
import { useT } from "@/lib/i18n";
import { Gloss } from "@/components/gloss";
import { reasonKey, verdict } from "@/lib/motion";

export function MotionCard({ job }: { job: Job }) {
  const { t } = useT();
  const m = t.motion;
  const { unlock } = useEggs();
  const agreed = job.status === "done" && !!job.motion && verdict(job.motion) === "agree";
  useEffect(() => {
    if (agreed) unlock("galileo");
  }, [agreed, unlock]);
  if (job.status !== "done" || job.motion === undefined) return null;

  const fmt = (n: number) => n.toLocaleString(t.locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 });

  if (!job.motion) {
    return (
      <section className="rounded-xl border bg-card/70 backdrop-blur-sm p-5 text-sm" aria-labelledby="motion-title">
        <h3 id="motion-title" className="font-medium">{m.title}</h3>
        <p className="mt-2 text-muted-foreground">
          {m.unavailable} {m.reasons[reasonKey(job.motion_reason)]}
        </p>
      </section>
    );
  }

  const { value, error } = job.motion.rate_arcsec_yr;
  const cat = job.motion.catalog;
  const v = verdict(job.motion);
  const predicted = cat?.predicted_rate_arcsec_yr;
  const max = Math.max(1, value + error, predicted ?? 0) * 1.25;
  const pos = (n: number) => `${Math.min(100, Math.max(0, (n / max) * 100))}%`;

  return (
    <section className="space-y-4 rounded-xl border bg-card/70 backdrop-blur-sm p-5 text-sm" aria-labelledby="motion-title">
      <h3 id="motion-title" className="font-medium">{m.title}</h3>

      <dl className="grid gap-3 sm:grid-cols-2">
        <div>
          <dt className="flex items-center gap-2 text-muted-foreground">
            <span className="size-2.5 rounded-full bg-primary" aria-hidden />
            {m.measured}
          </dt>
          <dd className="mt-1 text-2xl font-semibold tabular-nums">
            {fmt(value)}″{" "}
            <span className="text-base font-normal text-muted-foreground">
              ± {fmt(error)}″ {m.perYear}
            </span>
          </dd>
        </div>
        {cat && predicted !== undefined && (
          <div>
            <dt className="flex items-center gap-2 text-muted-foreground">
              <span className="h-3 w-0.5 bg-amber-300" aria-hidden />
              {m.predicted}
            </dt>
            <dd className="mt-1 text-2xl font-semibold tabular-nums">
              {fmt(predicted)}″ <span className="text-base font-normal text-muted-foreground">{m.perYear}</span>
            </dd>
          </div>
        )}
      </dl>

      <div className="relative h-8" aria-hidden>
        <div className="absolute inset-x-0 top-1/2 h-px bg-border" />
        <div
          className="absolute top-1/2 h-3 -translate-y-1/2 rounded-full bg-primary/25"
          style={{ left: pos(value - error), width: `calc(${pos(value + error)} - ${pos(value - error)})` }}
        />
        <div className="absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary" style={{ left: pos(value) }} />
        {predicted !== undefined && (
          <div className="absolute top-1 h-6 w-0.5 -translate-x-1/2 bg-amber-300" style={{ left: pos(predicted) }} />
        )}
        <span className="absolute -bottom-3 left-0 text-[10px] text-muted-foreground">0″</span>
        <span className="absolute right-0 -bottom-3 text-[10px] text-muted-foreground">
          {fmt(max)}″ {m.perYear}
        </span>
      </div>

      <p className={`pt-2 font-medium ${v === "agree" ? "text-emerald-300" : v === "disagree" ? "text-amber-300" : ""}`}>{m[v]}</p>
      {v === "agree" && <p className="border-l-2 border-amber-300/60 pl-3 text-sm text-muted-foreground italic">{t.eggs.galileo}</p>}
      <p className="text-xs text-muted-foreground">
        <Gloss text={m.scale} />
        {cat && ` ${m.source}: ${cat.name} (${cat.object}).`}
      </p>
    </section>
  );
}
