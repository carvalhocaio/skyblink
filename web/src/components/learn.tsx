"use client";

import { useState } from "react";
import { ExternalLink } from "lucide-react";
import { useT } from "@/lib/i18n";
import { SpherexModel } from "@/components/spherex-model";

const DETECTORS = [
  { id: "D1", range: "0.75–1.1 µm", color: "#7c3aed" },
  { id: "D2", range: "1.1–1.6 µm", color: "#2563eb" },
  { id: "D3", range: "1.6–2.4 µm", color: "#0891b2" },
  { id: "D4", range: "2.4–3.8 µm", color: "#059669" },
  { id: "D5", range: "3.8–4.4 µm", color: "#ca8a04" },
  { id: "D6", range: "4.4–5.0 µm", color: "#dc2626" },
];

export function AboutSpherex() {
  const { t } = useT();
  const a = t.about;
  const [picked, setPicked] = useState(5);
  const [part, setPart] = useState(0);
  const d = DETECTORS[picked];
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
                className={`min-h-10 rounded-full border px-4 text-sm transition hover:-translate-y-0.5 ${
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
          <p className="text-lg leading-relaxed text-foreground">{a.p1}</p>
          <p className="leading-relaxed">{a.p2}</p>
          <p className="leading-relaxed">{a.p3}</p>
          <dl className="grid grid-cols-2 gap-3 pt-2 sm:grid-cols-3">
            {a.numbers.map((x) => (
              <div key={x.k} className="rounded-xl border bg-card/60 p-4 backdrop-blur-sm">
                <dt className="font-mono text-[10px] tracking-widest uppercase">{x.k}</dt>
                <dd className="mt-1 text-2xl font-semibold tracking-tight text-foreground tabular-nums">{x.v}</dd>
              </div>
            ))}
          </dl>
        </div>
      </div>

      <ul className="grid gap-4 text-sm md:grid-cols-3">
        {a.facts.map((f, i) => (
          <li key={i} className="rounded-xl border bg-card/70 p-5 backdrop-blur-sm">
            <b className="text-base">{f.title}</b>
            <p className="mt-2 leading-relaxed text-muted-foreground">{f.text}</p>
          </li>
        ))}
      </ul>

      <div className="space-y-3">
        <h3 className="font-medium">{a.detTitle}</h3>
        <p className="text-sm text-muted-foreground">{a.detHelp}</p>
        <div role="group" aria-label={a.detectors} className="grid grid-cols-6 gap-0.5 overflow-hidden rounded-md">
          {DETECTORS.map((x, i) => (
            <button
              key={x.id}
              type="button"
              aria-pressed={i === picked}
              onClick={() => setPicked(i)}
              style={{ background: x.color }}
              className={`py-3 font-mono text-sm font-semibold text-white outline-none focus-visible:ring-3 focus-visible:ring-white ${
                i === picked ? "ring-2 ring-white ring-inset" : "opacity-55 hover:opacity-90"
              }`}
            >
              {x.id}
            </button>
          ))}
        </div>
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>{a.shorter}</span>
          <span>{a.longer}</span>
        </div>
        <p className="rounded-xl border bg-card/70 backdrop-blur-sm p-4 text-sm" aria-live="polite">
          <b>
            {d.id} · {d.range}
          </b>
          <br />
          {a.detText[picked]}
        </p>
        <p className="text-xs text-muted-foreground">{a.colorNote}</p>
      </div>

      <div className="space-y-4">
        <h3 className="font-medium">{a.moreTitle}</h3>
        <ul className="grid gap-3 md:grid-cols-3">
          {a.links.map((l) => (
            <li key={l.href}>
              <a
                href={l.href}
                target="_blank"
                rel="noopener noreferrer"
                className="group flex h-full items-start justify-between gap-4 rounded-xl border bg-card/70 p-5 backdrop-blur-sm transition hover:-translate-y-0.5 hover:border-primary/50"
              >
                <span>
                  <span className="block font-medium">{l.label}</span>
                  <span className="mt-1 block text-sm text-muted-foreground">{l.by}</span>
                </span>
                <ExternalLink className="size-4 shrink-0 text-muted-foreground transition group-hover:text-primary" aria-hidden />
              </a>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export function Faq() {
  const { t } = useT();
  return (
    <div className="divide-y rounded-xl border bg-card/70 backdrop-blur-sm">
      {t.faq.items.map((f, i) => (
        <details key={i} className="p-4">
          <summary className="cursor-pointer font-medium">{f.q}</summary>
          <p className="mt-2 text-sm text-muted-foreground">{f.a}</p>
        </details>
      ))}
    </div>
  );
}
