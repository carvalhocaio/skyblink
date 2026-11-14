"use client";

import { ArrowUpRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useT } from "@/lib/i18n";
import { TARGETS } from "@/lib/targets";
import type { Target } from "@/lib/use-job";

type Props = { initial: Target | null; error: boolean; onSubmit: (t: Target) => void };

export function TargetForm({ initial, error, onSubmit }: Props) {
  const { t } = useT();
  const p = t.pick;
  const activeIndex = TARGETS.findIndex((x) => initial?.ra === x.ra && initial?.dec === x.dec);
  const mono = "font-mono text-[11px] tracking-[0.2em] uppercase";
  return (
    <div className="space-y-6">
      <div className="flex items-baseline justify-between gap-4">
        <h3 className={`text-muted-foreground ${mono}`}>{p.title}</h3>
        <p className={`text-muted-foreground tabular-nums ${mono}`} aria-hidden>
          <span className="text-foreground">{activeIndex >= 0 ? String(activeIndex + 1).padStart(2, "0") : "—"}</span> / {String(TARGETS.length).padStart(2, "0")}
        </p>
      </div>
      <ul className="border-t">
        {TARGETS.map((x, i) => {
          const active = i === activeIndex;
          return (
            <li key={x.name} className="border-b">
              <button
                type="button"
                onClick={() => onSubmit({ ra: x.ra, dec: x.dec, fov: 6 })}
                aria-pressed={active}
                className={`group flex w-full gap-4 py-5 text-left transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50 ${
                  active ? "text-foreground" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- 59 px real frame, upscaled pixel-exact */}
                <img
                  src={`/targets/${x.thumb}.png`}
                  alt=""
                  width={56}
                  height={56}
                  className={`size-14 shrink-0 rounded-md border bg-black transition-opacity ${active ? "" : "opacity-60 group-hover:opacity-100"}`}
                  style={{ imageRendering: "pixelated" }}
                />
                <span className="min-w-0 flex-1">
                  <span className="flex items-start justify-between gap-3">
                    <span className="text-2xl font-medium tracking-tight md:text-[1.75rem]">{x.name}</span>
                    <ArrowUpRight
                      className={`mt-1 size-6 shrink-0 transition-all ${active ? "opacity-100" : "-translate-x-1 opacity-0 group-hover:translate-x-0 group-hover:opacity-60"}`}
                      strokeWidth={1}
                      aria-hidden
                    />
                  </span>
                  <span className={`mt-1 block font-mono text-[10px] tracking-widest uppercase ${active ? "text-primary" : ""}`}>
                    {x.moves ? p.move : p.brightness}
                  </span>
                  <span className="mt-2 block text-sm text-muted-foreground">{p.stories[i]}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      <details className="rounded-md border p-4" open={error}>
        <summary className="cursor-pointer text-sm font-medium">{p.custom}</summary>
        <form
          className="mt-4 space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            onSubmit({ ra: Number(f.get("ra")), dec: Number(f.get("dec")), fov: Number(f.get("fov")) });
          }}
        >
          <p className="text-sm text-muted-foreground">{p.customHelp}</p>
          <div className="grid grid-cols-3 gap-3">
            <Field name="ra" label={p.ra} min={0} max={360} value={initial?.ra} />
            <Field name="dec" label={p.dec} min={-90} max={90} value={initial?.dec} />
            <Field name="fov" label={p.fov} min={1} max={30} value={initial?.fov ?? 6} />
          </div>
          <p className="text-xs text-muted-foreground">{p.fovHelp}</p>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {p.inputError}
            </p>
          )}
          <Button type="submit" className="w-full">
            {p.submit}
          </Button>
        </form>
      </details>
    </div>
  );
}

function Field({ name, label, min, max, value }: { name: string; label: string; min: number; max: number; value?: number }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={name}>{label}</Label>
      <Input id={name} name={name} type="number" step="any" required min={min} max={max} defaultValue={value} />
    </div>
  );
}
