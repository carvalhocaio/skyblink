"use client";

import { Suspense, useEffect, useRef, useState, type ReactNode } from "react";
import { ArrowRight, ArrowUpRight, Box, Cat, Languages, Menu, X } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { TargetForm } from "@/components/target-form";
import { Player } from "@/components/player";
import { JobAlerts, JobProgress } from "@/components/job-status";
import { MotionCard } from "@/components/motion-card";
import { AboutSpherex, Faq } from "@/components/learn";
import { Explainer } from "@/components/explainer";
import { LANGS, useT, type Lang } from "@/lib/i18n";
import { findTarget, TARGETS } from "@/lib/targets";
import { useJob, type Target } from "@/lib/use-job";
import { EggsProvider, useEggs, useNewton } from "@/lib/eggs";
import { Sky } from "@/components/sky";
import { StarLife } from "@/components/star-life";
import StarBorder from "@/components/StarBorder";
import ClickSpark from "@/components/ClickSpark";

const DETECTOR = "D6";
const WRAP = "mx-auto w-full max-w-7xl px-4 md:px-10";
const PAD = "scroll-mt-16 py-24 md:py-32";

// Scroll explicitly instead of relying on the URL hash: it also works when the URL does not change, and a sticky
// anchor (the player on wide screens) is measured from its column's natural start, not from where it is stuck.
function scrollToAnchor(id: string) {
  const el = document.getElementById(id);
  if (!el) return;
  const from = getComputedStyle(el).position === "sticky" && el.parentElement ? el.parentElement : el;
  const top = from.getBoundingClientRect().top + scrollY - parseFloat(getComputedStyle(el).scrollMarginTop || "0");
  scrollTo({ top, behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
}
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
    router.push(`?${q}${hash}`, { scroll: false });
    if (hash) requestAnimationFrame(() => scrollToAnchor(hash.slice(1)));
  };
  const submit = (x: Target) => {
    setRun((r) => r + 1);
    go({ ra: x.ra, dec: x.dec, fov: x.fov }, "#watch");
  };
  const barnard = TARGETS[0];
  const showBarnard = () => submit({ ra: barnard.ra, dec: barnard.dec, fov: 6 });
  const navLinks = [
    ["#how", t.nav.how],
    ["#explore", t.nav.explore],
    ["#spherex", t.nav.spherex],
    ["#faq", t.nav.faq],
  ];

  const [scrolled, setScrolled] = useState(false);
  const [menu, setMenu] = useState(false);
  useEffect(() => {
    if (!menu) return;
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setMenu(false);
    const wide = matchMedia("(min-width: 1024px)");
    const close = () => wide.matches && setMenu(false);
    document.body.style.overflow = "hidden";
    addEventListener("keydown", esc);
    wide.addEventListener("change", close);
    return () => {
      document.body.style.overflow = "";
      removeEventListener("keydown", esc);
      wide.removeEventListener("change", close);
    };
  }, [menu]);
  useEffect(() => {
    const on = () => setScrolled(scrollY > 8);
    on();
    addEventListener("scroll", on, { passive: true });
    return () => removeEventListener("scroll", on);
  }, []);

  const { unlock } = useEggs();
  const { tap: tapLogo, node: apple } = useNewton();
  const toTop = () => scrollTo({ top: 0, behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
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
      <a href="#main" className="sr-only z-[60] rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground focus:not-sr-only focus:fixed focus:top-3 focus:left-3">
        {t.nav.skip}
      </a>
      <div id="top" className={`sticky top-0 z-50 transition-colors duration-300 ${menu ? "border-b bg-background" : scrolled ? "border-b bg-background/75 backdrop-blur-md" : "border-b border-transparent bg-black"}`}>
        <div className={`${WRAP} flex h-16 items-center justify-between gap-4`}>
          <button type="button" onClick={(e) => { toTop(); tapLogo(e); }} className="flex min-h-11 items-center gap-2.5 text-lg font-semibold tracking-tight select-none" aria-label="SkyBlink">
            <span aria-hidden className="logo-dot" />
            SkyBlink
          </button>
          <nav aria-label="Sections" className="flex items-center gap-1 text-sm text-muted-foreground">
            {navLinks.map(([href, label]) => (
              <a key={href} href={href} className="hidden rounded-full px-3 py-2 transition-colors hover:bg-white/5 hover:text-foreground lg:block">
                {label}
              </a>
            ))}
            <div role="group" aria-label={t.nav.language} className="ml-2 flex items-center gap-0.5 rounded-full border bg-card/60 p-1">
              <Languages className="mx-1.5 size-4 text-muted-foreground" aria-hidden />
              {(Object.keys(LANGS) as Lang[]).map((code) => (
                <button
                  key={code}
                  type="button"
                  lang={code}
                  aria-pressed={lang === code}
                  aria-label={LANGS[code]}
                  title={LANGS[code]}
                  onClick={() => lang !== code && go({ lang: code })}
                  className={`min-h-9 min-w-11 rounded-full px-3 text-xs font-semibold tracking-wider transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50 ${
                    lang === code ? "bg-white/10 text-foreground" : "text-muted-foreground hover:bg-white/5 hover:text-foreground"
                  }`}
                >
                  {code.toUpperCase()}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => setMenu((m) => !m)}
              aria-expanded={menu}
              aria-controls="mobile-menu"
              aria-label={menu ? t.nav.close : t.nav.menu}
              className="flex size-11 items-center justify-center rounded-full border bg-card/60 text-foreground transition-colors hover:border-white/30 active:scale-95 lg:hidden"
            >
              {menu ? <X className="size-5" aria-hidden /> : <Menu className="size-5" aria-hidden />}
            </button>
          </nav>
        </div>
      </div>
      {/* Outside the bar: its backdrop-blur would trap a fixed child inside it. */}
      {menu && (
        <nav id="mobile-menu" aria-label={t.nav.menu} className="fade-up fixed inset-x-0 top-16 bottom-0 z-40 overflow-y-auto bg-background lg:hidden" style={{ animationDuration: "0.3s" }}>
          <ul className={`${WRAP} divide-y border-b py-4`}>
            {navLinks.map(([href, label], i) => (
              <li key={href}>
                <a href={href} onClick={() => setMenu(false)} className="flex min-h-16 items-center gap-4 text-2xl font-medium tracking-tight transition-colors hover:text-primary">
                  <span className="font-mono text-xs text-muted-foreground tabular-nums">{String(i + 1).padStart(2, "0")}</span>
                  {label}
                </a>
              </li>
            ))}
          </ul>
          <div className={`${WRAP} py-8`}>
            <Button
              size="lg"
              className="h-12 w-full rounded-full text-[15px]"
              onClick={() => {
                setMenu(false);
                showBarnard();
              }}
            >
              {t.hero.cta}
            </Button>
          </div>
        </nav>
      )}

      <header ref={heroRef} className="relative overflow-hidden bg-black">
        <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 z-[1] h-24 bg-gradient-to-b from-transparent to-background" />
        <div className={`${WRAP} grid items-center gap-10 py-12 lg:min-h-[calc(100svh-4rem)] lg:grid-cols-[1.1fr_1fr] lg:py-16`}>
          <div className="relative z-10">
            <p className="fade-up mb-7 inline-flex items-center gap-2.5 rounded-full border bg-white/[0.03] py-1.5 pr-4 pl-3 text-sm text-muted-foreground">
              <span aria-hidden className="size-1.5 rounded-full bg-primary shadow-[0_0_10px_var(--primary)]" />
              {t.hero.badge}
            </p>
            <h1 className="fade-up text-5xl leading-[0.98] font-semibold tracking-[-0.04em] text-balance sm:text-6xl xl:text-[5.4rem]" style={{ animationDelay: "0.15s" }}>
              {t.hero.title}
            </h1>
            <p className="fade-up mt-7 max-w-xl text-lg leading-relaxed text-muted-foreground" style={{ animationDelay: "0.3s" }}>
              {t.hero.text}
            </p>
            <div className="fade-up mt-9 flex flex-wrap items-center gap-3" style={{ animationDelay: "0.45s" }}>
              {/* A star laps the main button: the one action that shows the whole idea. */}
              <StarBorder
                onClick={showBarnard}
                radius={24}
                color="#fde68a"
                glow={0.8}
                backgroundColor="var(--primary)"
                textColor="var(--primary-foreground)"
                borderColor="transparent"
                className="h-12 px-6 text-[15px] transition-transform hover:-translate-y-0.5 active:translate-y-0"
              >
                {t.hero.cta}
              </StarBorder>
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

      <main id="main" tabIndex={-1} className="outline-none">
        <section id="how" className={`${WRAP} space-y-10 ${PAD}`}>
          <SectionLabel n={1}>{t.nav.how}</SectionLabel>
          <h2 className="max-w-3xl text-3xl leading-[1.1] font-medium tracking-tight md:text-5xl">{t.how.title}</h2>
          <Explainer />
        </section>

        <section id="explore" className="scroll-mt-16 bg-black/50 backdrop-blur-[2px]">
          <div className={`${WRAP} ${PAD}`}>
            <SectionLabel n={2}>{t.explore.label}</SectionLabel>
            <h2 className="mt-8 max-w-4xl text-3xl leading-[1.1] font-medium tracking-tight text-balance md:text-5xl">{t.explore.heading}</h2>

            <div className="mt-14 grid gap-10 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
              {/* Picking a star throws a burst of stars. Outside the form: its key changes on every pick, which would cut the burst short. */}
              <ClickSpark sparkColor={["#22d3ee", "#fde68a"]} shape="star" sparkCount={10} sparkSize={12} sparkRadius={28}>
                <TargetForm key={targetKey} initial={target} error={!!inputError} onSubmit={submit} />
              </ClickSpark>

              <div id="watch" className="min-w-0 scroll-mt-20 space-y-4 lg:sticky lg:top-24 lg:self-start" aria-labelledby="watch-title">
                <h3 id="watch-title" className={`text-muted-foreground ${MONO}`}>
                  {t.watch.title}
                  {name && <span className="text-foreground">: {name}</span>}
                </h3>
                {!target && (
                  <div className="relative flex aspect-square flex-col items-center justify-center gap-6 overflow-hidden rounded-xl border bg-black p-8 text-center">
                    {/* eslint-disable-next-line @next/next/no-img-element -- real SPHEREx frame, upscaled pixel-exact */}
                    <img src={`/targets/${barnard.thumb}.png`} alt="" className="absolute inset-0 size-full object-cover opacity-30" style={{ imageRendering: "pixelated" }} />
                    <div aria-hidden className="absolute inset-0 bg-radial from-transparent to-black/90" />
                    <div className="relative space-y-2">
                      <p className="text-lg font-medium">{t.watch.empty}</p>
                      <p className="max-w-sm text-sm text-muted-foreground">{t.watch.emptyHint}</p>
                    </div>
                    <Button size="lg" className="relative h-12 rounded-full px-6 text-[15px] transition-transform hover:-translate-y-0.5 active:translate-y-0" onClick={showBarnard}>
                      {t.hero.cta}
                    </Button>
                  </div>
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
                    center={target ?? undefined}
                  />
                )}
                {job && <MotionCard job={job} />}
                {job && <JobAlerts job={job} frames={frames} />}
              </div>
            </div>
          </div>
        </section>


        <section id="spherex" className={`${WRAP} space-y-10 ${PAD}`}>
          <SectionLabel n={3}>{t.nav.spherex}</SectionLabel>
          <h2 className="max-w-3xl text-3xl leading-[1.1] font-medium tracking-tight md:text-5xl">{t.about.title}</h2>
          <AboutSpherex />
        </section>

        <section id="faq" className={`${WRAP} space-y-10 ${PAD}`}>
          <SectionLabel n={4}>{t.nav.faq}</SectionLabel>
          <h2 className="max-w-3xl text-3xl leading-[1.1] font-medium tracking-tight md:text-5xl">{t.faq.title}</h2>
          <Faq />
        </section>
      </main>

      <footer className="border-t bg-black/50">
        <div className={`${WRAP} grid gap-12 py-16 md:grid-cols-[1.4fr_1fr_1fr]`}>
          <div>
            <p className="flex items-center gap-2.5 text-2xl font-semibold tracking-tight">
              <span aria-hidden className="logo-dot" />
              SkyBlink
            </p>
            <p className="mt-4 max-w-sm text-sm leading-relaxed text-muted-foreground">{t.hero.tagline}</p>
            <Button size="lg" variant="outline" className="mt-6 h-12 rounded-full px-6 text-[15px] transition hover:-translate-y-0.5 hover:border-primary/60 active:translate-y-0" onClick={showBarnard}>
              {t.hero.cta}
            </Button>
          </div>
          <nav aria-label={t.foot.sections}>
            <p className={`text-muted-foreground ${MONO}`}>{t.foot.sections}</p>
            <ul className="mt-5 space-y-1">
              {navLinks.map(([href, label]) => (
                <li key={href}>
                  <a href={href} className="inline-flex min-h-10 items-center text-sm transition-colors hover:text-primary">
                    {label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
          <div>
            <p className={`text-muted-foreground ${MONO}`}>{t.foot.sources}</p>
            <ul className="mt-5 space-y-1">
              {t.about.links.map((l) => (
                <li key={l.href}>
                  <a href={l.href} target="_blank" rel="noopener noreferrer" className="group inline-flex min-h-10 items-center gap-1.5 text-sm transition-colors hover:text-primary">
                    {l.label}
                    <ArrowUpRight className="size-3.5 text-muted-foreground transition group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-primary" aria-hidden />
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </div>
        <div className="border-t">
          <div className={`${WRAP} flex flex-col gap-4 py-6 md:flex-row md:items-center md:justify-between`}>
            <p className="max-w-3xl text-xs leading-relaxed text-muted-foreground">{t.footer}</p>
            <button
              type="button"
              onClick={openBox}
              className="group flex min-h-11 shrink-0 items-center gap-2 self-start rounded-full border border-dashed px-4 text-xs text-muted-foreground transition-colors hover:border-white/30 hover:text-foreground md:self-auto"
            >
              {cat === null ? <Box className="size-4 transition-transform group-hover:-rotate-12" aria-hidden /> : <Cat className="size-4 text-primary" aria-hidden />}
              <span aria-live="polite">{cat === null ? t.eggs.box : cat ? t.eggs.alive : t.eggs.dead}</span>
            </button>
          </div>
        </div>
      </footer>
    </>
  );
}

export default function HomePage() {
  return (
    <Suspense>
      <EggsProvider>
        <Home />
      </EggsProvider>
    </Suspense>
  );
}
