"use client";

import { Suspense, useEffect, useRef, useState, type ReactNode } from "react";
import { ArrowRight, Box, Cat } from "lucide-react";
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
import { EggsProvider, useEggs, useNewton } from "@/lib/eggs";
import { Sky } from "@/components/sky";
import { StarLife } from "@/components/star-life";

const DETECTOR = "D6";
const WRAP = "mx-auto w-full max-w-7xl px-4 md:px-10";
const MONO = "font-mono text-[11px] tracking-[0.2em] uppercase";

function num(v: string | null) {
  const n = v === null || v === "" ? NaN : Number(v);
  return Number.isFinite(n) ? n : null;
}

function SectionLabel({ n, children }: { n: number; children: ReactNode }) {
  return (
    <p className="flex items-center gap-3 font-mono text-xs tracking-[0.2em] text-primary uppercase">
      <span aria-hidden className="orbit" />
      <span className="text-muted-foreground tabular-nums">{String(n).padStart(2, "0")}</span>
      {children}
    </p>
  );
}

function Home() {
  const params = useSearchParams();
  const router = useRouter();
  const { lang, t } = useT();
  const [run, setRun] = useState(0);
  const heroRef = useRef<HTMLElement>(null);

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

  // Opened with ?ra=&dec= on a phone: the player sits far below the hero, so bring it into view.
  const openedWithTarget = useRef(target !== null);
  useEffect(() => {
    if (!openedWithTarget.current || !matchMedia("(max-width: 1023px)").matches) return;
    const smooth = !matchMedia("(prefers-reduced-motion: reduce)").matches;
    document.getElementById("watch")?.scrollIntoView({ behavior: smooth ? "smooth" : "auto" });
  }, []);

  const go = (changes: Record<string, string | number>, hash = "") => {
    const q = new URLSearchParams(params);
    for (const [k, v] of Object.entries(changes)) q.set(k, String(v));
    if (q.get("lang") === "en") q.delete("lang");
    router.push(`?${q}${hash}`, { scroll: !!hash });
  };
  const submit = (x: Target) => {
    setRun((r) => r + 1);
    go({ ra: x.ra, dec: x.dec, fov: x.fov }, "#watch");
  };
  const barnard = TARGETS[0];
  const showBarnard = () => submit({ ra: barnard.ra, dec: barnard.dec, fov: 6 });
  const navLinks = [
    ["#explore", t.nav.explore],
    ["#how", t.nav.how],
    ["#spherex", t.nav.spherex],
    ["#faq", t.nav.faq],
  ];

  const { unlock } = useEggs();
  const { tap: tapLogo, node: apple } = useNewton();
  const [cat, setCat] = useState<boolean | null>(null);
  const openBox = () => {
    setCat(Math.random() < 0.5);
    unlock("schrodinger");
  };
  const rDra = featured === TARGETS[4] && job?.status === "done" && frames.length > 0;
  useEffect(() => {
    if (rDra) unlock("hawking");
  }, [rDra, unlock]);

  return (
    <>
      <Sky />
      {apple}
      <header id="top" ref={heroRef} className="relative overflow-hidden bg-black">
        <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 z-[1] h-24 bg-gradient-to-b from-transparent to-background" />
        <div className={`${WRAP} relative z-10 flex h-18 items-center justify-between gap-4`}>
          <button type="button" onClick={tapLogo} className="flex min-h-11 items-center gap-2.5 text-lg font-semibold tracking-tight select-none" aria-label="SkyBlink">
            <span aria-hidden className="logo-dot" />
            SkyBlink
          </button>
          <nav aria-label="Sections" className="flex items-center gap-1 text-sm text-muted-foreground">
            {navLinks.map(([href, label]) => (
              <a key={href} href={href} className="hidden rounded-full px-3 py-2 transition-colors hover:bg-white/5 hover:text-foreground md:block">
                {label}
              </a>
            ))}
            <label className="ml-2">
              <span className="sr-only">{t.nav.language}</span>
              <select
                value={lang}
                onChange={(e) => go({ lang: e.target.value as Lang })}
                className="min-h-10 rounded-full border bg-card/60 px-3 text-sm text-foreground outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
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

        <div className={`${WRAP} grid items-center gap-10 pt-6 pb-16 md:pt-10 lg:grid-cols-[1.1fr_1fr] lg:pb-20`}>
          <div className="relative z-10">
            <p className="fade-up flex flex-wrap gap-2" style={{ animationDelay: "0.05s" }}>
              {t.hero.tags.map((x) => (
                <span key={x} className="rounded-full border bg-card/50 px-3 py-1 font-mono text-[11px] tracking-[0.14em] text-muted-foreground uppercase">
                  {x}
                </span>
              ))}
            </p>
            <h1 className="fade-up mt-7 text-5xl leading-[0.98] font-semibold tracking-[-0.04em] text-balance sm:text-6xl xl:text-[5.4rem]" style={{ animationDelay: "0.15s" }}>
              {t.hero.title}
            </h1>
            <p className="fade-up mt-7 max-w-xl text-lg leading-relaxed text-muted-foreground" style={{ animationDelay: "0.3s" }}>
              {t.hero.text}
            </p>
            <div className="fade-up mt-9 flex flex-wrap items-center gap-3" style={{ animationDelay: "0.45s" }}>
              <Button size="lg" className="h-12 rounded-full px-6 text-[15px] transition-transform hover:-translate-y-0.5 active:translate-y-0" onClick={showBarnard}>
                {t.hero.cta}
              </Button>
              <a href="#how" className="inline-flex min-h-12 items-center gap-2 rounded-full border px-5 text-[15px] transition-colors hover:border-white/30 hover:bg-white/5">
                {t.hero.secondary} <ArrowRight className="size-4" aria-hidden />
              </a>
            </div>
          </div>

          <div>
            <StarLife section={heroRef} onPick={(i) => submit({ ra: TARGETS[i].ra, dec: TARGETS[i].dec, fov: 6 })} />
          </div>
        </div>
      </header>

      <main>
        <section id="explore" className="scroll-mt-0 border-y bg-black/40 backdrop-blur-[2px]">
          <div className={`${WRAP} py-20 md:py-28`}>
            <SectionLabel n={2}>{t.explore.label}</SectionLabel>
            <h2 className="mt-8 max-w-4xl text-3xl leading-[1.1] font-medium tracking-tight text-balance md:text-5xl">{t.explore.heading}</h2>

            <div className="mt-14 grid gap-10 border-t pt-10 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
              <TargetForm key={targetKey} initial={target} error={!!inputError} onSubmit={submit} />

              <div id="watch" className="min-w-0 scroll-mt-4 space-y-4" aria-labelledby="watch-title">
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

      <footer className="border-t bg-black/50">
        <div className={`${WRAP} flex flex-col gap-6 py-10 md:flex-row md:items-end md:justify-between`}>
          <div>
            <p className="text-3xl font-semibold tracking-tight">SkyBlink</p>
            <p className="mt-3 max-w-xl text-xs leading-relaxed text-muted-foreground">{t.footer}</p>
          </div>
          <button
            type="button"
            onClick={openBox}
            className="group flex min-h-11 items-center gap-2 self-start rounded-full border border-dashed px-4 text-xs text-muted-foreground transition-colors hover:border-white/30 hover:text-foreground md:self-auto"
          >
            {cat === null ? <Box className="size-4 transition-transform group-hover:-rotate-12" aria-hidden /> : <Cat className="size-4 text-primary" aria-hidden />}
            <span aria-live="polite">{cat === null ? t.eggs.box : cat ? t.eggs.alive : t.eggs.dead}</span>
          </button>
        </div>
      </footer>
    </>
  );
}

export default function Page() {
  return (
    <Suspense>
      <EggsProvider>
        <Home />
      </EggsProvider>
    </Suspense>
  );
}
