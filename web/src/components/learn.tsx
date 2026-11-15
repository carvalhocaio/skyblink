"use client";

import { useState } from "react";
import { ChevronDown, Droplets, Orbit, RotateCw, Sparkles, type LucideIcon } from "lucide-react";

const FACT_ICONS: LucideIcon[] = [Sparkles, Orbit, Droplets];
import { useT } from "@/lib/i18n";
import { Gloss } from "@/components/gloss";
import { SpherexModel } from "@/components/spherex-model";
import { Detectors } from "@/components/detectors";
import Counter from "@/components/Counter";
import FlipCard from "@/components/FlipCard";

// "650 km" → 650 + " km"; "−210 °C" → − 210 °C. Dates like "Mar 2025" stay as text.
const QUANTITY = /^(−?)(\d+)(.*)$/;


export function AboutSpherex() {
  const { t } = useT();
  const a = t.about;
  const [part, setPart] = useState(0);
  return (
    <div className="space-y-14">
      <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-start">
        <div className="space-y-4">
          <div className="overflow-hidden rounded-xl border bg-[radial-gradient(ellipse_at_50%_40%,oklch(0.25_0.05_230/0.6),transparent_70%)]">
            <SpherexModel selected={part} onSelect={setPart} label={`${a.modelTitle}: ${a.parts.map((x) => x.name).join(", ")}`} />
          </div>
          <p className="text-center text-xs text-muted-foreground">{a.drag}</p>
          <div role="group" aria-label={a.modelTitle} className="flex flex-wrap justify-center gap-2">
            {a.parts.map((x, i) => (
              <button
                key={x.name}
                type="button"
                aria-pressed={i === part}
                onClick={() => setPart(i)}
                className={`min-h-11 rounded-full border px-4 text-sm transition hover:-translate-y-0.5 ${
                  i === part ? "border-primary bg-primary text-primary-foreground" : "hover:border-white/30"
                }`}
              >
                {x.name}
              </button>
            ))}
          </div>
          <p className="rounded-xl border bg-card/70 p-4 text-sm backdrop-blur-sm" aria-live="polite">
            <b>{a.parts[part].name}</b>
            <br />
            <span className="text-muted-foreground">{a.parts[part].text}</span>
          </p>
          <p className="text-xs text-muted-foreground">{a.modelNote}</p>
        </div>

        <div className="space-y-5 text-muted-foreground">
          <p className="text-lg leading-relaxed text-foreground"><Gloss text={a.p1} /></p>
          <p className="leading-relaxed"><Gloss text={a.p2} /></p>
          <p className="leading-relaxed"><Gloss text={a.p3} /></p>
          <dl className="grid grid-cols-2 gap-3 pt-2 sm:grid-cols-3">
            {a.numbers.map((x) => (
              <div key={x.k} className="rounded-xl border bg-card/60 p-4 backdrop-blur-sm">
                <dt className="font-mono text-[10px] tracking-widest uppercase">{x.k}</dt>
                <dd className="mt-1 text-2xl font-semibold tracking-tight text-foreground tabular-nums">
                  <Quantity text={x.v} />
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </div>

      <ul className="grid gap-4 text-sm md:grid-cols-3">
        {a.facts.map((f, i) => {
          const Icon = FACT_ICONS[i];
          const face = "flex h-full flex-col rounded-[inherit] border p-5 text-left";
          return (
            <li key={i}>
              {/* A tiny quiz: think about the question first, then flip for SPHEREx's answer. */}
              <FlipCard
                className="w-full!"
                height={230}
                radius={8}
                tilt={false}
                shadow={false}
                hoverScale={1.02}
                background="color-mix(in oklab, var(--card) 85%, transparent)"
                color="var(--card-foreground)"
                ariaLabel={`${f.title} ${a.flip}`}
                front={
                  <div className={`${face} transition-colors group-hover:border-primary/50`}>
                    <span className="mb-4 flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <Icon className="size-5" aria-hidden />
                    </span>
                    <b className="text-lg leading-snug">{f.title}</b>
                    <span className="mt-auto flex items-center gap-1.5 text-xs text-primary">
                      <RotateCw className="size-3.5" aria-hidden />
                      {a.flip}
                    </span>
                  </div>
                }
                back={
                  <div className={`${face} border-primary/50`}>
                    <span className="font-mono text-[10px] tracking-widest text-primary uppercase">{a.answer}</span>
                    <p className="mt-3 text-base leading-relaxed">{f.text}</p>
                    <span className="mt-auto flex items-center gap-1.5 text-xs text-muted-foreground">
                      <RotateCw className="size-3.5" aria-hidden />
                      {a.flipBack}
                    </span>
                  </div>
                }
              />
            </li>
          );
        })}
      </ul>

      <div className="space-y-5">
        <div className="space-y-2">
          <h3 className="text-2xl font-medium tracking-tight">{a.detTitle}</h3>
          <p className="max-w-2xl text-muted-foreground"><Gloss text={a.detHelp} /></p>
        </div>
        <Detectors />
      </div>
    </div>
  );
}

export function Faq() {
  const { t } = useT();
  return (
    <div className="divide-y rounded-xl border bg-card/70 backdrop-blur-sm">
      {t.faq.items.map((f, i) => (
        <details key={i} className="group px-4 py-1">
          <summary className="flex min-h-12 list-none items-center justify-between gap-4 font-medium [&::-webkit-details-marker]:hidden">
            {f.q}
            <ChevronDown className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" aria-hidden />
          </summary>
          <p className="pb-4 text-sm leading-relaxed text-muted-foreground"><Gloss text={f.a} /></p>
        </details>
      ))}
    </div>
  );
}

/** Numbers roll in like an odometer the first time they scroll into view. */
function Quantity({ text }: { text: string }) {
  const { t } = useT();
  const m = QUANTITY.exec(text);
  if (!m) return <>{text}</>;
  // Sign and unit sit outside the counter: its digits are centred in a 1em box, so centre the text next to them too.
  return (
    <span className="inline-flex items-center whitespace-pre">
      {m[1]}
      <Counter value={Number(m[2])} locale={t.locale} fontSize="1.5rem" />
      {m[3]}
    </span>
  );
}
