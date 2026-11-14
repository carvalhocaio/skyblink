"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { Atom } from "lucide-react";
import { useT } from "@/lib/i18n";

export const EGGS = ["newton", "galileo", "einstein", "curie", "schrodinger", "heisenberg", "hawking", "feynman"] as const;
export type Egg = (typeof EGGS)[number];

const KEY = "skyblink-eggs";
const TYPED: Partial<Record<string, Egg>> = { einstein: "einstein", curie: "curie" };

type Ctx = { found: Set<Egg>; unlock: (e: Egg) => void; reset: () => void; timeScale: number };
const EggCtx = createContext<Ctx>({ found: new Set(), unlock: () => {}, reset: () => {}, timeScale: 1 });
export const useEggs = () => useContext(EggCtx);

function load(): Set<Egg> {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    return new Set((Array.isArray(v) ? v : []).filter((x) => (EGGS as readonly string[]).includes(x)));
  } catch {
    return new Set();
  }
}

export function EggsProvider({ children }: { children: ReactNode }) {
  const [found, setFound] = useState<Set<Egg>>(new Set());
  const [toast, setToast] = useState<Egg | null>(null);
  const [timeScale, setTimeScale] = useState(1);
  const foundRef = useRef(found);

  useEffect(() => {
    const f = load();
    foundRef.current = f;
    setFound(f); // eslint-disable-line react-hooks/set-state-in-effect -- localStorage only exists after mount
  }, []);

  const unlock = useCallback((e: Egg) => {
    if (e === "einstein") {
      setTimeScale(0.08);
      setTimeout(() => setTimeScale(1), 9000);
    }
    if (e === "curie") {
      document.documentElement.classList.add("radium");
      setTimeout(() => document.documentElement.classList.remove("radium"), 9000);
    }
    setToast(e);
    if (foundRef.current.has(e)) return;
    const next = new Set(foundRef.current).add(e);
    foundRef.current = next;
    setFound(next);
    try {
      localStorage.setItem(KEY, JSON.stringify([...next]));
    } catch {}
  }, []);

  const reset = useCallback(() => {
    foundRef.current = new Set();
    setFound(new Set());
    try {
      localStorage.removeItem(KEY);
    } catch {}
  }, []);

  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 6500);
    return () => clearTimeout(id);
  }, [toast]);

  // Typed names (outside form fields) and a console greeting for Feynman.
  useEffect(() => {
    let buf = "";
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest("input, textarea, select") || e.key.length !== 1) return;
      buf = (buf + e.key.toLowerCase()).slice(-12);
      for (const [word, egg] of Object.entries(TYPED)) if (buf.endsWith(word)) unlock(egg!);
    };
    addEventListener("keydown", onKey);
    const w = window as unknown as { feynman?: () => string };
    w.feynman = () => {
      unlock("feynman");
      return "Hi! Now go break something and figure out why.";
    };
    console.log(
      "%c“What I cannot create, I do not understand.” — Richard Feynman\n%cYou like looking under the hood. Type feynman() to say hi.",
      "font: 600 14px system-ui; color: #67e8f9",
      "font: 12px system-ui; color: #a3a3a3",
    );
    return () => {
      removeEventListener("keydown", onKey);
      delete w.feynman;
    };
  }, [unlock]);

  return (
    <EggCtx.Provider value={{ found, unlock, reset, timeScale }}>
      {children}
      <EggTray toast={toast} />
    </EggCtx.Provider>
  );
}

function EggTray({ toast }: { toast: Egg | null }) {
  const { t } = useT();
  const g = t.eggs;
  const { found, reset } = useEggs();
  return (
    <>
      <div aria-live="polite" className="pointer-events-none fixed inset-x-4 bottom-20 z-50 flex justify-end">
        {toast && (
          <div key={toast} className="egg-toast pointer-events-auto max-w-sm rounded-xl border border-primary/30 bg-card/95 p-4 shadow-2xl backdrop-blur">
            <p className="font-mono text-[10px] tracking-[0.2em] text-primary uppercase">
              {g.found} · {found.size}/{EGGS.length}
            </p>
            <p className="mt-1 font-medium">
              {g.list[toast].name} <span className="text-muted-foreground">{g.list[toast].years}</span>
            </p>
            <EggLine egg={toast} />
          </div>
        )}
      </div>

      <button
        type="button"
        popoverTarget="egg-panel"
        className="fixed right-4 bottom-4 z-50 flex min-h-11 items-center gap-2 rounded-full border bg-card/80 px-4 font-mono text-xs backdrop-blur transition hover:-translate-y-0.5 hover:border-primary/50"
        aria-label={`${g.tray}: ${found.size}/${EGGS.length}`}
      >
        <Atom className={`size-4 text-primary ${found.size ? "" : "atom-idle"}`} aria-hidden />
        <span className="tabular-nums">
          {found.size}/{EGGS.length}
        </span>
      </button>

      <div
        id="egg-panel"
        popover="auto"
        className="egg-panel fixed inset-auto right-4 bottom-18 m-0 max-h-[70vh] w-[min(24rem,calc(100vw-2rem))] overflow-y-auto rounded-xl border bg-card p-5 text-foreground shadow-2xl"
      >
        <p className="font-medium">{g.tray}</p>
        <p className="mt-1 text-sm text-muted-foreground">{g.trayHint}</p>
        <ul className="mt-4 divide-y">
          {EGGS.map((e) => {
            const x = g.list[e];
            const ok = found.has(e);
            return (
              <li key={e} className="py-3 text-sm">
                <p className={ok ? "font-medium" : "text-muted-foreground"}>
                  {ok ? x.name : g.unknown}
                  {ok && <span className="ml-2 text-xs text-muted-foreground">{x.years}</span>}
                </p>
                {ok && <EggLine egg={e} />}
                <p className={`mt-1 text-xs ${ok ? "text-muted-foreground" : "text-primary/80"}`}>{ok ? x.how : x.hint}</p>
              </li>
            );
          })}
        </ul>
        {found.size > 0 && (
          <button type="button" onClick={reset} className="mt-2 min-h-11 text-xs text-muted-foreground underline-offset-4 hover:underline">
            {g.reset}
          </button>
        )}
      </div>
    </>
  );
}

/** Real, attributed quotes render as quotes; lines we wrote render as a labelled fun fact. */
function EggLine({ egg }: { egg: Egg }) {
  const { t } = useT();
  const x = t.eggs.list[egg];
  if ("quote" in x && x.quote) return <q className="mt-1 block text-sm text-muted-foreground italic">{x.line}</q>;
  return (
    <p className="mt-1 text-sm text-muted-foreground">
      <span className="mr-1.5 rounded-sm bg-primary/15 px-1.5 py-0.5 font-mono text-[10px] tracking-wider text-primary uppercase">{t.eggs.funFact}</span>
      {x.line}
    </p>
  );
}

/** Newton: three quick taps make an apple fall from where you tapped. */
export function useNewton() {
  const { unlock } = useEggs();
  const taps = useRef<number[]>([]);
  const [apple, setApple] = useState<{ x: number; y: number; k: number } | null>(null);
  const tap = (e: React.MouseEvent) => {
    const now = Date.now();
    taps.current = [...taps.current.filter((t) => now - t < 900), now];
    if (taps.current.length < 3) return;
    taps.current = [];
    setApple({ x: e.clientX, y: e.clientY, k: now });
    setTimeout(() => setApple((a) => (a?.k === now ? null : a)), 1500); // also clears when animations are off
    unlock("newton");
  };
  const node = apple && (
    <svg
      key={apple.k}
      viewBox="0 0 24 24"
      className="apple pointer-events-none fixed z-50 size-7"
      style={{ left: apple.x - 14, top: apple.y - 14 }}
      onAnimationEnd={() => setApple(null)}
      aria-hidden
    >
      <path d="M12 7c-2-1.6-6-1.4-7 2.6-1 4 1.6 10.4 4.6 10.4 1 0 1.6-.6 2.4-.6s1.4.6 2.4.6c3 0 5.6-6.4 4.6-10.4C18 5.6 14 5.4 12 7z" fill="#ef4444" />
      <path d="M12 7c0-2 .8-3.6 2.6-4.4" stroke="#a16207" strokeWidth="1.4" fill="none" strokeLinecap="round" />
      <path d="M13 4.6c1.6-1 3.4-.8 4.2.2-1.4 1-3 1-4.2-.2z" fill="#22c55e" />
    </svg>
  );
  return { tap, node };
}
