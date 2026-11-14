"use client";

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
  return (
    <div className="space-y-4">
      <h2 className="text-lg font-medium">{p.title}</h2>
      <ul className="grid gap-2">
        {TARGETS.map((x, i) => {
          const active = initial?.ra === x.ra && initial?.dec === x.dec;
          return (
            <li key={x.name}>
              <button
                type="button"
                onClick={() => onSubmit({ ra: x.ra, dec: x.dec, fov: 6 })}
                aria-pressed={active}
                className={`w-full rounded-lg border p-3 text-left transition-colors outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 ${
                  active ? "border-primary bg-muted" : ""
                }`}
              >
                <span className="flex items-baseline justify-between gap-2">
                  <span className="font-medium">
                    {i === 0 && <span aria-hidden>★ </span>}
                    {x.name}
                  </span>
                  <span className="text-xs text-cyan-300">{x.moves ? p.move : p.brightness}</span>
                </span>
                <span className="mt-1 block text-sm text-muted-foreground">{p.stories[i]}</span>
              </button>
            </li>
          );
        })}
      </ul>

      <details className="rounded-lg border p-3" open={error}>
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
