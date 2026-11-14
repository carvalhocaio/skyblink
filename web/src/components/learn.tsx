"use client";

import { useState } from "react";
import { Layers, MousePointerClick, PlayCircle } from "lucide-react";
import { useT } from "@/lib/i18n";

const DETECTORS = [
  { id: "D1", range: "0.75–1.1 µm", color: "#7c3aed" },
  { id: "D2", range: "1.1–1.6 µm", color: "#2563eb" },
  { id: "D3", range: "1.6–2.4 µm", color: "#0891b2" },
  { id: "D4", range: "2.4–3.8 µm", color: "#059669" },
  { id: "D5", range: "3.8–4.4 µm", color: "#ca8a04" },
  { id: "D6", range: "4.4–5.0 µm", color: "#dc2626" },
];

const STEP_ICONS = [MousePointerClick, Layers, PlayCircle];

export function HowItWorks() {
  const { t } = useT();
  return (
    <ol className="grid gap-4 md:grid-cols-3">
      {t.how.steps.map((s, i) => {
        const Icon = STEP_ICONS[i];
        return (
          <li key={i} className="rounded-xl border bg-card/60 p-6">
            <span className="flex items-center gap-3 text-primary">
              <Icon className="size-6" aria-hidden />
              <span className="text-sm font-medium">{i + 1}</span>
            </span>
            <h3 className="mt-3 font-medium">{s.title}</h3>
            <p className="mt-1 text-sm text-muted-foreground">{s.text}</p>
          </li>
        );
      })}
    </ol>
  );
}

export function AboutSpherex() {
  const { t } = useT();
  const a = t.about;
  const [picked, setPicked] = useState(5);
  const d = DETECTORS[picked];
  return (
    <div className="space-y-8">
      <div className="grid gap-6 md:grid-cols-2">
        <div className="space-y-3 text-muted-foreground">
          <p>{a.p1}</p>
          <p>{a.p2}</p>
        </div>
        <ul className="grid gap-3 text-sm">
          {a.facts.map((f, i) => (
            <li key={i} className="rounded-xl border bg-card/60 p-4">
              <b>{f.title}</b>
              <p className="mt-1 text-muted-foreground">{f.text}</p>
            </li>
          ))}
        </ul>
      </div>

      <div className="space-y-3">
        <h3 className="font-medium">{a.detTitle}</h3>
        <p className="text-sm text-muted-foreground">{a.detHelp}</p>
        <div role="group" aria-label={a.detectors} className="grid grid-cols-6 gap-0.5 overflow-hidden rounded-lg">
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
        <p className="rounded-xl border bg-card/60 p-4 text-sm" aria-live="polite">
          <b>
            {d.id} · {d.range}
          </b>
          <br />
          {a.detText[picked]}
        </p>
        <p className="text-xs text-muted-foreground">{a.colorNote}</p>
      </div>
    </div>
  );
}

export function Faq() {
  const { t } = useT();
  return (
    <div className="divide-y rounded-xl border bg-card/60">
      {t.faq.items.map((f, i) => (
        <details key={i} className="p-4">
          <summary className="cursor-pointer font-medium">{f.q}</summary>
          <p className="mt-2 text-sm text-muted-foreground">{f.a}</p>
        </details>
      ))}
    </div>
  );
}
