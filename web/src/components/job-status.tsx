"use client";

import { AlertTriangle, Info, XCircle } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Progress } from "@/components/ui/progress";
import { formatEta, formatMonth, groupAlerts, type Frame, type Job } from "@/lib/api";
import { useT } from "@/lib/i18n";

export function JobProgress({ job }: { job: Job }) {
  const { t } = useT();
  const eta = formatEta(job.eta_seconds, t.status.about);
  const searching = job.status === "queued" || job.status === "discovering";
  const measuring = job.status === "building" && job.progress.percent >= 100;
  return (
    <div className="space-y-2">
      <div className="flex justify-between text-sm">
        <span>{t.status[job.status]}</span>
        <span className="text-muted-foreground tabular-nums">
          {searching
            ? t.status.searching
            : measuring
              ? t.status.measuring
              : `${t.status.ready(job.progress.frames_done, job.progress.frames_total)}${eta ? ` · ${eta}` : ""}`}
        </span>
      </div>
      <Progress value={job.progress.percent} aria-label={t.status.progress} />
    </div>
  );
}

const ICONS = { error: XCircle, warning: AlertTriangle, info: Info };

export function JobAlerts({ job, frames }: { job: Job; frames: Frame[] }) {
  const { t } = useT();
  const alerts = groupAlerts(job, frames);
  if (!alerts.length) return null;
  return (
    <div className="space-y-2">
      {alerts.map(({ alert: a, dates }) => {
        const Icon = ICONS[a.severity] ?? Info;
        return (
          <Alert key={a.code} variant={a.severity === "error" ? "destructive" : "default"}>
            <Icon className={a.severity === "warning" ? "text-amber-400" : undefined} />
            <AlertDescription>
              {dates && <b className="text-foreground">{dates.map((d) => formatMonth(d, t.locale)).join(", ")}: </b>}
              {t.alerts[a.code] ?? a.code}
            </AlertDescription>
          </Alert>
        );
      })}
    </div>
  );
}
