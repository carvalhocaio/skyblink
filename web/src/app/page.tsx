"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { TargetForm } from "@/components/target-form";
import { Player } from "@/components/player";
import { JobAlerts, JobProgress } from "@/components/job-status";
import { AboutSpherex, Faq, HowItWorks } from "@/components/learn";
import { LANGS, useT, type Lang } from "@/lib/i18n";
import { findTarget, TARGETS } from "@/lib/targets";
import { useJob, type Target } from "@/lib/use-job";

const DETECTOR = "D6";

function num(v: string | null) {
  const n = v === null || v === "" ? NaN : Number(v);
  return Number.isFinite(n) ? n : null;
}

function Home() {
  const params = useSearchParams();
  const router = useRouter();
  const { lang, t } = useT();
  const [run, setRun] = useState(0);

  const ra = num(params.get("ra"));
  const dec = num(params.get("dec"));
  const target: Target | null = ra !== null && dec !== null ? { ra, dec, fov: num(params.get("fov")) ?? 6 } : null;
  const targetKey = target ? `${target.ra},${target.dec},${target.fov}` : "";
  const { job, error, inputError } = useJob(target, run);
  const frames = job?.frames.filter((f) => f.detector === DETECTOR) ?? [];
  const featured = findTarget(target?.ra, target?.dec);
  const name = featured?.name;

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  const go = (changes: Record<string, string | number>, hash = "") => {
    const q = new URLSearchParams(params);
    for (const [k, v] of Object.entries(changes)) q.set(k, String(v));
    if (q.get("lang") === "en") q.delete("lang");
    router.push(`?${q}${hash}`, { scroll: !!hash });
  };
  const submit = (x: Target) => {
    setRun((r) => r + 1);
    go({ ra: x.ra, dec: x.dec, fov: x.fov }, "#explore");
  };
  const barnard = TARGETS[0];

  return (
    <>
      <nav className="sticky top-0 z-10 border-b bg-background/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center gap-5 px-4 py-3 text-sm">
          <a href="#top" className="font-semibold">SkyBlink</a>
          <div className="flex gap-5 overflow-x-auto">
            <a href="#explore" className="shrink-0 text-muted-foreground hover:text-foreground">{t.nav.explore}</a>
            <a href="#how" className="shrink-0 text-muted-foreground hover:text-foreground">{t.nav.how}</a>
            <a href="#spherex" className="shrink-0 text-muted-foreground hover:text-foreground">{t.nav.spherex}</a>
            <a href="#faq" className="shrink-0 text-muted-foreground hover:text-foreground">{t.nav.faq}</a>
          </div>
          <label className="ml-auto flex shrink-0 items-center gap-2">
            <span className="sr-only">{t.nav.language}</span>
            <span aria-hidden>🌐</span>
            <select
              value={lang}
              onChange={(e) => go({ lang: e.target.value as Lang })}
              className="rounded-md border bg-background px-2 py-1 outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              {Object.entries(LANGS).map(([code, label]) => (
                <option key={code} value={code}>
                  {label}
                </option>
              ))}
            </select>
          </label>
        </div>
      </nav>

      <main id="top" className="mx-auto w-full max-w-6xl space-y-20 px-4 py-12">
        <header className="max-w-3xl space-y-5">
          <p className="text-sm tracking-widest text-cyan-300 uppercase">{t.hero.kicker}</p>
          <h1 className="text-4xl font-semibold tracking-tight md:text-5xl">{t.hero.title}</h1>
          <p className="text-lg text-muted-foreground">{t.hero.text}</p>
          <Button size="lg" onClick={() => submit({ ra: barnard.ra, dec: barnard.dec, fov: 6 })}>
            {t.hero.cta}
          </Button>
        </header>

        <section id="explore" className="grid scroll-mt-20 gap-8 lg:grid-cols-[380px_1fr]">
          <TargetForm key={targetKey} initial={target} error={!!inputError} onSubmit={submit} />

          <div className="min-w-0 space-y-4" aria-label={t.watch.title}>
            <h2 className="text-lg font-medium">
              {t.watch.title}
              {name && `: ${name}`}
            </h2>
            {!target && (
              <p className="rounded-lg border border-dashed p-10 text-center text-muted-foreground">
                {t.watch.empty}
                <br />
                {t.watch.emptyHint}
              </p>
            )}
            {(error || job?.status === "failed") && (
              <Alert variant="destructive">
                <AlertDescription className="flex flex-wrap items-center justify-between gap-3">
                  {error ? t.watch.networkError : t.watch.failed}
                  <Button size="sm" variant="outline" onClick={() => setRun((r) => r + 1)}>
                    {t.watch.retry}
                  </Button>
                </AlertDescription>
              </Alert>
            )}
            {target && !job && !error && !inputError && <p className="text-muted-foreground">{t.watch.starting}</p>}
            {job && job.status !== "done" && job.status !== "failed" && <JobProgress job={job} />}
            {job && (
              <Player
                key={`${targetKey}#${run}`}
                frames={frames}
                waiting={job.status !== "done"}
                object={featured && { name: featured.name, index: TARGETS.indexOf(featured) }}
              />
            )}
            {job && <JobAlerts job={job} frames={frames} />}
          </div>
        </section>

        <section id="how" className="scroll-mt-20 space-y-6">
          <h2 className="text-2xl font-semibold">{t.how.title}</h2>
          <HowItWorks />
        </section>

        <section id="spherex" className="scroll-mt-20 space-y-6">
          <h2 className="text-2xl font-semibold">{t.about.title}</h2>
          <AboutSpherex />
        </section>

        <section id="faq" className="scroll-mt-20 space-y-6">
          <h2 className="text-2xl font-semibold">{t.faq.title}</h2>
          <Faq />
        </section>
      </main>

      <footer className="border-t">
        <p className="mx-auto max-w-6xl px-4 py-6 text-xs text-muted-foreground">{t.footer}</p>
      </footer>
    </>
  );
}

export default function Page() {
  return (
    <Suspense>
      <Home />
    </Suspense>
  );
}
