"use client";

import { formatMonth, groupAlerts, type Frame, type Job } from "@/lib/api";
import { useT } from "@/lib/i18n";
import { Gloss } from "@/components/gloss";

/** Three questions a scientist asks before trusting a change, answered from this job's own alerts and motion. */
export function Investigate({ job, frames }: { job: Job; frames: Frame[] }) {
  const { t } = useT();
  const v = t.investigate;
  if (job.status !== "done") return null;

  const alerts = groupAlerts(job, frames);
  const has = (code: string) => alerts.find((a) => a.alert.code === code);
  const drift = has("ALIGNMENT_DRIFT");
  const background = drift
    ? v.bgDrift((drift.dates ?? frames.map((f) => f.mid_date)).map((d) => formatMonth(d, t.locale)).join(", "))
    : job.motion
      ? v.bgChecked // motion is only reported when enough reference stars line every picture up
      : v.bgUnknown;
  const fool = [has("SATURATED_CORE") && v.saturated, has("FEW_EXPOSURES") && v.few, v.color].filter((x): x is string => !!x);

  return (
    <section className="rounded-xl border bg-card/70 p-5 text-sm backdrop-blur-sm" aria-labelledby="investigate-title">
      <h3 id="investigate-title" className="font-medium">{v.title}</h3>
      <dl className="mt-3 space-y-3">
        <div>
          <dt className="font-medium text-primary">{v.bgQ}</dt>
          <dd className="mt-1 text-muted-foreground">{background}</dd>
        </div>
        <div>
          <dt className="font-medium text-primary">{v.foolQ}</dt>
          <dd className="mt-1 text-muted-foreground">
            <ul className="list-disc space-y-1 pl-5">
              {fool.map((x) => (
                <li key={x}><Gloss text={x} /></li>
              ))}
            </ul>
          </dd>
        </div>
        <div>
          <dt className="font-medium text-primary">{v.discoveryQ}</dt>
          <dd className="mt-1 text-muted-foreground">{v.discovery}</dd>
        </div>
      </dl>
    </section>
  );
}
