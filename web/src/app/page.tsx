"use client";

import { Suspense, useEffect, useState, type ReactNode } from "react";
import { ArrowRight, Plus } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { TargetForm } from "@/components/target-form";
import { Player } from "@/components/player";
import { JobAlerts, JobProgress } from "@/components/job-status";
import { MotionCard } from "@/components/motion-card";
import { AboutSpherex, Faq, HowItWorks } from "@/components/learn";
import { LANGS, useT, type Lang } from "@/lib/i18n";
import { findTarget, TARGETS } from "@/lib/targets";
import { useJob, type Target } from "@/lib/use-job";

const DETECTOR = "D6";
const WRAP = "mx-auto w-full max-w-7xl px-4 md:px-10";
const MONO = "font-mono text-[11px] tracking-[0.2em] uppercase";

function num(v: string | null) {
  const n = v === null || v === "" ? NaN : Number(v);
  return Number.isFinite(n) ? n : null;
}

function SectionLabel({ n, children }: { n: number; children: ReactNode }) {
  return (
    <p className={MONO}>
      <span className="text-muted-foreground">[ {String(n).padStart(2, "0")} ]</span>{" "}
      <span className="font-semibold">{children}</span>
    </p>
  );
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
  const showBarnard = () => submit({ ra: barnard.ra, dec: barnard.dec, fov: 6 });
  const navLinks = [
    ["#explore", t.nav.explore],
    ["#how", t.nav.how],
    ["#spherex", t.nav.spherex],
    ["#faq", t.nav.faq],
  ];

  return (
    <>
      <header id="top" className={`${WRAP} pt-6`}>
        <p aria-label="SkyBlink" className="text-mega overflow-hidden pb-[0.06em] font-semibold whitespace-nowrap">
          {"SKYBLINK".split("").map((c, i) => (
            <span key={i} aria-hidden className="rise" style={{ animationDelay: `${0.1 + i * 0.06}s` }}>
              {c}
            </span>
          ))}
        </p>

        <div className={`fade-up mt-8 grid gap-6 text-gray-800 md:grid-cols-[1fr_auto_2fr_auto_1fr] md:items-start ${MONO}`} style={{ animationDelay: "0.5s" }}>
          <p className="hidden leading-relaxed md:block">
            {t.hero.tags.map((x) => (
              <span key={x} className="block">
                {x}
              </span>
            ))}
          </p>
          <ArrowRight className="mt-1 hidden size-3.5 text-muted-foreground md:block" strokeWidth={1} aria-hidden />
          <p className="max-w-md leading-relaxed tracking-[0.12em] normal-case">{t.hero.tagline}</p>
          <ArrowRight className="mt-1 hidden size-3.5 text-muted-foreground md:block" strokeWidth={1} aria-hidden />
          <nav aria-label="Sections" className="flex flex-wrap items-center gap-x-5 gap-y-2 md:flex-col md:items-start md:gap-1.5">
            {navLinks.map(([href, label]) => (
              <a key={href} href={href} className="py-2.5 hover:text-black hover:underline md:py-0">
                {label}
              </a>
            ))}
            <label className="flex items-center gap-2 md:mt-2">
              <span className="sr-only">{t.nav.language}</span>
              <select
                value={lang}
                onChange={(e) => go({ lang: e.target.value as Lang })}
                className="min-h-9 rounded-md border bg-background px-2 py-1 tracking-[0.1em] outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                {Object.entries(LANGS).map(([code, label]) => (
                  <option key={code} value={code}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
          </nav>
        </div>

        <div className="mt-14 grid items-end gap-10 pb-20 md:mt-20 lg:grid-cols-[minmax(0,1fr)_minmax(0,400px)_200px]">
          <div className="fade-up space-y-6" style={{ animationDelay: "0.6s" }}>
            <p className={`flex items-center gap-3 ${MONO}`}>
              01 <span className="h-px w-16 bg-black/20" aria-hidden />
            </p>
            <h1 className="max-w-xl text-4xl leading-[1.05] font-normal tracking-tight text-balance md:text-6xl">{t.hero.title}</h1>
            <p className="max-w-md text-[15px] leading-relaxed text-gray-700">{t.hero.text}</p>
            <div className="flex flex-wrap items-center gap-4">
              <Button
                size="lg"
                className="h-12 px-6 text-[15px] transition-all hover:-translate-y-0.5 hover:shadow-[3px_3px_0_rgba(17,17,17,0.5)] active:translate-y-0 active:shadow-none"
                onClick={showBarnard}
              >
                {t.hero.cta}
              </Button>
              <a href="#how" className={`inline-flex min-h-11 items-center gap-2 underline-offset-4 hover:underline ${MONO}`}>
                {t.hero.secondary} <ArrowRight className="size-3.5" aria-hidden />
              </a>
            </div>
          </div>

          {/* eslint-disable-next-line @next/next/no-img-element -- animated GIF of real SPHEREx frames, served as-is */}
          <img
            src="/demo/barnard.gif"
            alt={t.hero.gifAlt}
            width={472}
            height={472}
            className="fade-up mx-auto w-full max-w-[400px] rounded-md bg-black"
            style={{ animationDelay: "0.8s" }}
          />

          <dl className="fade-up space-y-5 text-[13px]" style={{ animationDelay: "0.9s" }}>
            <div>
              <dt className="font-mono text-[10px] font-bold tracking-widest uppercase">{barnard.name}</dt>
              <dd className="mt-1 leading-relaxed text-gray-600">{t.hero.specKind}</dd>
            </div>
            {[
              [t.hero.specMotion, `${(10.5).toLocaleString(t.locale)}″ ${t.motion.perYear}`],
              [t.hero.specSeasons, t.hero.specSeasonsValue],
              [t.hero.specDetector, "D6 · 4.4–5.0 µm"],
            ].map(([k, v]) => (
              <div key={k}>
                <dt className="font-mono text-[10px] tracking-widest text-gray-500 uppercase">{k}</dt>
                <dd className="mt-0.5 font-medium">{v}</dd>
              </div>
            ))}
            <button type="button" onClick={showBarnard} className="group flex min-h-11 items-center gap-3 outline-none">
              <span className="flex size-10 items-center justify-center rounded-full border border-gray-400 transition-colors group-hover:border-black group-hover:bg-[#111] group-hover:text-white group-focus-visible:ring-3 group-focus-visible:ring-ring/50">
                <Plus className="size-4" strokeWidth={1.5} aria-hidden />
              </span>
              <span className="font-mono text-[10px] font-bold tracking-widest uppercase">{t.hero.details}</span>
            </button>
          </dl>
        </div>
      </header>

      <main>
        <section id="explore" className="dark scroll-mt-0 bg-background text-foreground">
          <div className={`${WRAP} py-20 md:py-28`}>
            <SectionLabel n={2}>{t.explore.label}</SectionLabel>
            <h2 className="mt-8 max-w-4xl text-3xl leading-[1.1] font-medium tracking-tight text-balance md:text-5xl">{t.explore.heading}</h2>

            <div className="mt-14 grid gap-10 border-t pt-10 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
              <TargetForm key={targetKey} initial={target} error={!!inputError} onSubmit={submit} />

              <div className="min-w-0 space-y-4" aria-labelledby="watch-title">
                <h3 id="watch-title" className={`text-muted-foreground ${MONO}`}>
                  {t.watch.title}
                  {name && <span className="text-foreground">: {name}</span>}
                </h3>
                {!target && (
                  <p className="rounded-md border border-dashed p-10 text-center text-muted-foreground">
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
                {job && <MotionCard job={job} />}
                {job && <JobAlerts job={job} frames={frames} />}
              </div>
            </div>
          </div>
        </section>

        <section id="how" className={`${WRAP} space-y-10 py-20 md:py-28`}>
          <SectionLabel n={3}>{t.nav.how}</SectionLabel>
          <h2 className="max-w-3xl text-3xl leading-[1.1] font-medium tracking-tight md:text-5xl">{t.how.title}</h2>
          <HowItWorks />
        </section>

        <section id="spherex" className={`${WRAP} space-y-10 border-t py-20 md:py-28`}>
          <SectionLabel n={4}>{t.nav.spherex}</SectionLabel>
          <h2 className="max-w-3xl text-3xl leading-[1.1] font-medium tracking-tight md:text-5xl">{t.about.title}</h2>
          <AboutSpherex />
        </section>

        <section id="faq" className={`${WRAP} space-y-10 border-t py-20 md:py-28`}>
          <SectionLabel n={5}>{t.nav.faq}</SectionLabel>
          <h2 className="max-w-3xl text-3xl leading-[1.1] font-medium tracking-tight md:text-5xl">{t.faq.title}</h2>
          <Faq />
        </section>
      </main>

      <footer className="dark bg-background text-foreground">
        <div className={`${WRAP} flex flex-col gap-4 py-10 md:flex-row md:items-end md:justify-between`}>
          <p className="text-4xl font-semibold tracking-tight">SkyBlink</p>
          <p className="max-w-xl font-mono text-[11px] leading-relaxed tracking-wider text-muted-foreground">{t.footer}</p>
        </div>
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
