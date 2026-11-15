"use client";

// Blink Hunter: six rounds alternating "find the moving star" on blinking synthetic sky pictures
// with SPHEREx quiz questions. Each round ends with a short fact and its source.
import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronLeft, ChevronRight, ExternalLink, Pause, Play, X } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { useT } from "@/lib/i18n";

const N = 32; // grid cells per side
const FRAMES = 3;
const BLINK_MS = 700;
type Star = { x: number; y: number; b: number[] };
type Field = { stars: Star[]; mover: { x: number; y: number }[]; noise: number };

/** A random patch of sky: still stars, one mover, maybe a variable star. */
function makeField(kind: string): Field {
  const r = (a: number, b: number) => a + Math.random() * (b - a);
  const stars: Star[] = [];
  const far = (x: number, y: number) => stars.every((s) => Math.hypot(s.x - x, s.y - y) > 4);
  while (stars.length < 14) {
    const x = Math.round(r(2, N - 3)), y = Math.round(r(2, N - 3));
    if (far(x, y)) stars.push({ x, y, b: Array(FRAMES).fill(r(0.35, 1)) });
  }
  const dir = Math.random() * Math.PI * 2;
  const step = 2;
  const sx = Math.round(r(8, N - 9)), sy = Math.round(r(8, N - 9));
  const mover = [0, 1, 2].map((f) => ({ x: Math.round(sx + Math.cos(dir) * step * f), y: Math.round(sy + Math.sin(dir) * step * f) }));
  const faint = kind === "faint";
  stars.push(...mover.map((p, f) => ({ ...p, b: [0, 1, 2].map((g) => (g === f ? (faint ? 0.4 : 0.9) : 0)) })));
  if (kind === "variable") {
    // Replace a still star far from the mover with one that brightens and fades.
    const v = stars.find((s) => s.b[0] === s.b[1] && Math.hypot(s.x - sx, s.y - sy) > 8);
    if (v) v.b = [0.25, 1, 0.55];
  }
  return { stars, mover, noise: faint ? 0.14 : 0.08 };
}

function draw(c: HTMLCanvasElement, field: Field, frame: number) {
  const g = c.getContext("2d")!;
  const img = g.createImageData(N, N);
  const v = new Float32Array(N * N);
  for (let i = 0; i < v.length; i++) v[i] = Math.random() * field.noise;
  for (const s of field.stars) {
    const b = s.b[frame];
    if (!b) continue;
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        const x = s.x + dx, y = s.y + dy;
        if (x < 0 || y < 0 || x >= N || y >= N) continue;
        v[y * N + x] += b * (dx === 0 && dy === 0 ? 1 : dx && dy ? 0.12 : 0.35);
      }
  }
  for (let i = 0; i < v.length; i++) {
    const k = Math.min(v[i], 1) * 255;
    img.data.set([k * 0.92, k * 0.97, k, 255], i * 4);
  }
  g.putImageData(img, 0, 0);
}

export default function BlinkGame({ onClose }: { onClose: () => void }) {
  const { t } = useT();
  const G = t.game;
  const rounds = G.rounds;
  const dlg = useRef<HTMLDialogElement>(null);
  const [stage, setStage] = useState<"intro" | "play" | "end">("intro");
  const [round, setRound] = useState(0);
  const [score, setScore] = useState(0);
  const [done, setDone] = useState<null | boolean>(null); // round answered: right or wrong
  const [picked, setPicked] = useState(-1);
  const [misses, setMisses] = useState(0);
  const nextBtn = useRef<HTMLButtonElement>(null);
  const R = rounds[round];

  useEffect(() => {
    dlg.current?.showModal();
    dlg.current?.querySelector<HTMLElement>("[data-autofocus]")?.focus(); // showModal ignores React's autoFocus
  }, []);
  useEffect(() => {
    if (done !== null) nextBtn.current?.focus();
  }, [done]);

  const answer = (ok: boolean, i = -1) => {
    setPicked(i);
    setDone(ok);
    if (ok) setScore((s) => s + 1);
  };
  const advance = () => {
    if (round + 1 >= rounds.length) return setStage("end");
    setRound(round + 1);
    setDone(null);
    setPicked(-1);
    setMisses(0);
  };
  const restart = () => {
    setRound(0);
    setScore(0);
    setDone(null);
    setPicked(-1);
    setMisses(0);
    setStage("play");
  };
  const rank = score < 3 ? 0 : score < 5 ? 1 : 2;

  return (
    <dialog
      ref={dlg}
      onClose={onClose}
      aria-labelledby="game-title"
      className="m-auto w-[min(40rem,calc(100vw-1rem))] max-h-[94dvh] overflow-y-auto rounded-2xl border bg-card p-0 text-foreground shadow-2xl backdrop:bg-black/80 backdrop:backdrop-blur-sm"
    >
      <div className="flex items-center justify-between gap-4 border-b px-5 py-3">
        <h2 id="game-title" className="font-semibold tracking-tight">{G.title}</h2>
        <div className="flex items-center gap-3">
          {stage === "play" && (
            <p className="font-mono text-xs text-muted-foreground tabular-nums">
              {G.round(round + 1, rounds.length)} · {G.score} {score}
            </p>
          )}
          <button type="button" onClick={() => dlg.current?.close()} aria-label={G.close} className="flex size-11 items-center justify-center rounded-full text-muted-foreground hover:text-foreground">
            <X className="size-5" aria-hidden />
          </button>
        </div>
      </div>

      <div className="space-y-5 p-5">
        {stage === "intro" && (
          <>
            <p className="leading-relaxed text-muted-foreground">{G.intro}</p>
            <Button className="h-11 rounded-full px-6" onClick={() => setStage("play")} data-autofocus>
              {G.start}
            </Button>
          </>
        )}

        {stage === "play" && (
          <>
            {R.kind === "quiz" ? (
              <fieldset className="space-y-3">
                <legend className="mb-3 text-lg font-medium">{R.q}</legend>
                {R.options.map((o, i) => {
                  const state = done === null ? "" : i === R.answer ? "border-emerald-400 bg-emerald-400/10" : i === picked ? "border-red-400 bg-red-400/10" : "opacity-60";
                  return (
                    <button
                      key={o}
                      type="button"
                      disabled={done !== null}
                      onClick={() => answer(i === R.answer, i)}
                      className={`flex min-h-12 w-full items-center justify-between gap-3 rounded-xl border px-4 text-left text-sm transition hover:border-primary/60 disabled:hover:border-current ${state}`}
                    >
                      {o}
                      {done !== null && i === R.answer && <Check className="size-4 shrink-0 text-emerald-400" aria-hidden />}
                    </button>
                  );
                })}
              </fieldset>
            ) : (
              <BlinkRound
                key={round}
                kind={R.kind}
                done={done !== null}
                misses={misses}
                onMiss={() => setMisses((m) => m + 1)}
                onFound={() => answer(misses < 2)}
              />
            )}

            {done !== null && (
              <div aria-live="polite" className="space-y-3 rounded-xl border bg-background/60 p-4 text-sm">
                <p className={`font-medium ${done ? "text-emerald-400" : "text-amber-300"}`}>
                  {R.kind === "quiz" ? (done ? G.correct : G.wrong) : G.right}
                </p>
                <p className="leading-relaxed text-muted-foreground">{R.fact}</p>
                <a href={R.ref.href} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center gap-1.5 text-primary underline-offset-4 hover:underline">
                  {G.learn}: {R.ref.label}
                  <ExternalLink className="size-3.5" aria-hidden />
                </a>
                <div>
                  <Button ref={nextBtn} className="h-11 rounded-full px-6" onClick={advance}>
                    {round + 1 >= rounds.length ? G.finish : G.nextRound}
                  </Button>
                </div>
              </div>
            )}
          </>
        )}

        {stage === "end" && (
          <>
            <div className="space-y-2 text-center" aria-live="polite">
              <p className="font-mono text-xs tracking-[0.2em] text-primary uppercase">{G.ranks[rank]}</p>
              <p className="text-3xl font-semibold tracking-tight">{G.result(score, rounds.length)}</p>
              <p className="text-muted-foreground">{G.rankText[rank]}</p>
            </div>
            <div className="flex flex-wrap justify-center gap-2">
              <Button className="h-11 rounded-full px-5" onClick={restart} autoFocus>
                {G.again}
              </Button>
              <a href="#explore" onClick={() => dlg.current?.close()} className={buttonVariants({ variant: "outline", className: "h-11 rounded-full px-5" })}>
                {G.real}
              </a>
            </div>
            <div>
              <h3 className="mb-2 text-sm font-medium">{G.refsTitle}</h3>
              <ul className="divide-y rounded-xl border text-sm">
                {G.refs.map((l) => (
                  <li key={l.href}>
                    <a href={l.href} target="_blank" rel="noopener noreferrer" className="flex min-h-12 items-center justify-between gap-3 px-4 hover:text-primary">
                      <span>
                        {l.label} <span className="text-muted-foreground">· {l.by}</span>
                      </span>
                      <ExternalLink className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          </>
        )}
      </div>
    </dialog>
  );
}

function BlinkRound({ kind, done, misses, onMiss, onFound }: { kind: string; done: boolean; misses: number; onMiss: () => void; onFound: () => void }) {
  const { t } = useT();
  const G = t.game;
  const field = useMemo(() => makeField(kind), [kind]);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [frame, setFrame] = useState(0);
  const [playing, setPlaying] = useState(() => !matchMedia("(prefers-reduced-motion: reduce)").matches);
  const [cursor, setCursor] = useState<{ x: number; y: number } | null>(null);
  const [miss, setMiss] = useState(false);

  useEffect(() => {
    if (canvas.current) draw(canvas.current, field, frame);
  }, [field, frame]);
  useEffect(() => {
    if (!playing) return;
    const id = setInterval(() => setFrame((f) => (f + 1) % FRAMES), BLINK_MS);
    return () => clearInterval(id);
  }, [playing]);

  const pick = (x: number, y: number) => {
    if (done) return;
    if (field.mover.some((p) => Math.hypot(p.x - x, p.y - y) <= 2.2)) onFound();
    else {
      setMiss(true);
      onMiss();
    }
  };
  const step = (d: number) => {
    setPlaying(false);
    setFrame((f) => (f + d + FRAMES) % FRAMES);
  };
  const onKey = (e: React.KeyboardEvent) => {
    const moves: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    const c = cursor ?? { x: N / 2, y: N / 2 };
    if (moves[e.key]) {
      e.preventDefault();
      const [dx, dy] = moves[e.key];
      setCursor({ x: Math.min(N - 1, Math.max(0, c.x + dx)), y: Math.min(N - 1, Math.max(0, c.y + dy)) });
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      setCursor(c);
      pick(c.x, c.y);
    }
  };
  const mid = field.mover[1];
  const pct = (v: number) => `${((v + 0.5) / N) * 100}%`;

  return (
    <div className="space-y-3">
      <p className="text-lg font-medium">{G.prompts[kind as keyof typeof G.prompts]}</p>
      <div
        tabIndex={0}
        role="application"
        aria-label={G.canvas}
        aria-describedby="blink-keys"
        onKeyDown={onKey}
        onClick={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          pick(Math.floor(((e.clientX - r.left) / r.width) * N), Math.floor(((e.clientY - r.top) / r.height) * N));
        }}
        className={`relative mx-auto aspect-square w-full max-w-[400px] cursor-crosshair overflow-hidden rounded-xl border bg-black outline-none focus-visible:ring-3 focus-visible:ring-ring/50 ${done ? "pointer-events-none" : ""}`}
      >
        <canvas ref={canvas} width={N} height={N} className="size-full" style={{ imageRendering: "pixelated" }} />
        <span className="absolute top-2 left-2 rounded bg-black/70 px-2 py-1 font-mono text-xs text-white">{G.picture(frame + 1)}</span>
        <span className="absolute right-2 bottom-2 rounded bg-black/70 px-2 py-1 font-mono text-[10px] text-white/80">{G.simulated}</span>
        {cursor && !done && (
          <span aria-hidden className="pointer-events-none absolute size-[9%] -translate-1/2 rounded-sm border-2 border-primary" style={{ left: pct(cursor.x), top: pct(cursor.y) }} />
        )}
        {(misses >= 2 || done) && (
          <span
            aria-hidden
            className={`pointer-events-none absolute size-[30%] -translate-1/2 rounded-full border-2 ${done ? "border-emerald-400" : "border-amber-300 border-dashed"}`}
            style={{ left: pct(mid.x), top: pct(mid.y) }}
          />
        )}
      </div>
      <div className="flex items-center justify-center gap-2">
        <Button variant="outline" size="icon" className="size-11" onClick={() => step(-1)} aria-label={G.prev}>
          <ChevronLeft />
        </Button>
        <Button size="icon" className="size-11" onClick={() => setPlaying((p) => !p)} aria-label={playing ? G.pause : G.play}>
          {playing ? <Pause /> : <Play />}
        </Button>
        <Button variant="outline" size="icon" className="size-11" onClick={() => step(1)} aria-label={G.next}>
          <ChevronRight />
        </Button>
      </div>
      <p id="blink-keys" className="text-center text-xs text-muted-foreground">{G.keys}</p>
      {!done && (
        <p aria-live="polite" className="min-h-5 text-center text-sm text-amber-300">
          {misses >= 2 ? G.hint : miss ? G.miss : ""}
        </p>
      )}
    </div>
  );
}
