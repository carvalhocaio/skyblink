"use client";

// "Life of stars" scrub hero, adapted from the Life of the Sun shader recipe:
// one ball, ten surfaces, thrown by every drag. Five stages are real SkyBlink targets.
import { useEffect, useRef, useState, type RefObject } from "react";
import { ArrowRight } from "lucide-react";
import { useT } from "@/lib/i18n";
import { useEggs } from "@/lib/eggs";

type Look = { c0: number[]; c1: number[]; c2: number[]; glow: number[]; gI: number; freq: number; warp: number; cells: number; gas: number; shell: number; boil: number };

// Index into TARGETS for stages that are real SkyBlink objects.
const TARGET_OF = [-1, -1, 3, 2, 1, 0, -1, 4, -1, -1];

const LOOK: Look[] = [
  { c0: [.05, .01, .1], c1: [.62, .12, .42], c2: [1.9, .85, .5], glow: [.8, .25, .6], gI: .22, freq: 2.6, warp: 1.9, cells: 0, gas: 1, shell: 0, boil: 1 },
  { c0: [.015, .004, 0], c1: [.62, .05, .01], c2: [3, 1.1, .15], glow: [1.3, .2, .04], gI: .28, freq: 3.1, warp: 1.2, cells: 1, gas: 0, shell: 0, boil: .7 },
  { c0: [.35, .04, 0], c1: [1.5, .42, .05], c2: [3.2, 2, .6], glow: [1.4, .45, .1], gI: .7, freq: 4.2, warp: 1.8, cells: .2, gas: .35, shell: 0, boil: 1.4 },
  { c0: [.02, .004, .015], c1: [.3, .04, .16], c2: [.85, .22, .32], glow: [.5, .1, .3], gI: .16, freq: 2.2, warp: 1.4, cells: 0, gas: 0, shell: 0, boil: .45 },
  { c0: [.07, .01, .02], c1: [.75, .12, .18], c2: [1.8, .55, .35], glow: [.9, .2, .25], gI: .32, freq: 2.6, warp: 1.6, cells: .1, gas: 0, shell: 0, boil: .7 },
  { c0: [.28, .02, .002], c1: [1.15, .16, .02], c2: [2.4, .7, .1], glow: [1.5, .2, .03], gI: .75, freq: 3.2, warp: 1.4, cells: .1, gas: 0, shell: 0, boil: 1 },
  { c0: [1, .26, .01], c1: [2.3, 1, .12], c2: [3.6, 2.9, 1.3], glow: [1.8, .68, .1], gI: 1, freq: 3.4, warp: 1.1, cells: 0, gas: 0, shell: 0, boil: 1.1 },
  { c0: [.22, .008, .003], c1: [1.25, .1, .015], c2: [3, .95, .1], glow: [1.8, .16, .03], gI: .85, freq: 2, warp: 2.1, cells: .35, gas: 0, shell: 0, boil: 1.4 },
  { c0: [.02, .09, .12], c1: [.1, .7, .72], c2: [1.8, .42, .16], glow: [.3, .7, .8], gI: .3, freq: 3.4, warp: 1.5, cells: 0, gas: .75, shell: 1, boil: .9 },
  { c0: [.8, 1, 1.5], c1: [1.7, 2.1, 3], c2: [3.6, 4.2, 5.4], glow: [.8, 1.2, 2.1], gI: .9, freq: 2.6, warp: .8, cells: 0, gas: 0, shell: 0, boil: .5 },
];
const LAST = LOOK.length - 1, PER = 4, N = LAST * PER + 1, START = 5; // opens on Barnard's Star

const VS = "attribute vec2 a;void main(){gl_Position=vec4(a,0.,1.);}";
const FS = `precision highp float;
uniform vec2 res, ctr;
uniform float rad, fade, t, evo, rot, blur, starX, freq, warp, cells, gas, shell, gI, flick;
uniform vec3 c0, c1, c2, glow;
float h(vec3 p){ p = fract(p*.3183099 + .1); p *= 17.; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
float n3(vec3 x){ vec3 i = floor(x), f = fract(x); f = f*f*(3.-2.*f);
  return mix(mix(mix(h(i),h(i+vec3(1,0,0)),f.x), mix(h(i+vec3(0,1,0)),h(i+vec3(1,1,0)),f.x), f.y),
             mix(mix(h(i+vec3(0,0,1)),h(i+vec3(1,0,1)),f.x), mix(h(i+vec3(0,1,1)),h(i+vec3(1,1,1)),f.x), f.y), f.z); }
float fbm(vec3 p){ float a=.5, s=0.; for(int i=0;i<5;i++){ s+=a*n3(p); p=p*2.03+vec3(1.7,9.2,3.1); a*=.5; } return s; }
vec3 stars(vec2 uv){
  vec2 q = (uv + vec2(starX, 0.))*34., id = floor(q), f = fract(q)-.5;
  float r = fract(sin(dot(id,vec2(127.1,311.7)))*43758.5453);
  vec2 o = vec2(fract(r*17.3),fract(r*91.7))-.5;
  float tw = .55+.45*sin(t*(.7+r*1.8)+r*40.);
  vec2 g = f-o*.7; g.x *= 1./(1.+blur*7.);
  return vec3(smoothstep(.975,1.,r)*smoothstep(.06,.0,length(g))*tw*.55);
}
void main(){
  vec2 uv = (gl_FragCoord.xy - .5*res)/res.y, p = uv - ctr;
  float d = length(p), e = max(d-rad, 0.);
  vec3 col = stars(uv);
  vec2 dir = p/max(d,1e-4);
  float rays = .72 + .56*fbm(vec3(dir*2.4, evo*.5));
  float hal = exp(-e/(rad*.11))*smoothstep(rad*.6, rad*.12, e);
  col += glow*gI*.7*hal*rays*flick;
  float py = (p.y + rad + .028)/.0135, px = p.x/(rad*1.02);
  float pool = max(0., 1.-px*px) * exp(-py*py);
  col += glow*min(gI,1.)*.1*pool*pool;
  if(d < rad + .02){
    float k = min(d/rad, 1.);
    vec3 nrm = vec3(p/rad, sqrt(max(1.-k*k, 0.)));
    float cr = cos(rot), sr = sin(rot);
    vec3 n = vec3(nrm.x*cr + nrm.z*sr, nrm.y, -nrm.x*sr + nrm.z*cr);
    float sq = 1./(1.+blur*3.2);
    vec3 q = vec3(n.x*sq, n.y, n.z*sq);
    float w1 = fbm(q*freq + vec3(0.,0.,evo*.28)), w2 = fbm(q*freq*.9 + 7. - vec3(evo*.22,0.,0.));
    float v = fbm(q*freq*1.7 + warp*2.2*vec3(w1, w2, w1-w2));
    float vein = 1.-abs(2.*fbm(q*freq*1.5 + warp*1.3*vec3(w2, w1, 0.))-1.);
    vein = pow(vein, 9.);
    float s = smoothstep(.24,.76,v);
    s = mix(s, clamp(vein*1.25 + s*.14,0.,1.), cells);
    vec3 c = mix(c0, c1, smoothstep(.0,.55,s));
    c = mix(c, c2, smoothstep(.5,1.,s));
    float mu = nrm.z;
    if(shell > .001){
      vec3 sh = c0 + c1*smoothstep(.95,.3,k)*(.25+v*1.2);
      float fil = smoothstep(.5,.82,k)*smoothstep(1.,.8,k)*pow(v+.32,3.)*3.2;
      sh += c2*fil + vec3(3.5,4.,5.)*exp(-k*k/.012);
      c = mix(c, sh, shell);
    } else {
      c *= mix(mix(.34, .8, gas), 1., pow(mu,.5));
    }
    c += glow*pow(1.-mu,2.6)*.42*min(gI,1.)*(1.-gas);
    float edge = smoothstep(1., .985, k);
    float soft = smoothstep(1., .58, k + (fbm(q*3.4 + evo*.1)-.5)*.62) * smoothstep(1., .9, k);
    col = mix(col, c, mix(edge, soft, gas));
  }
  col = 1. - exp(-col*1.15);
  gl_FragColor = vec4(pow(col, vec3(.4545))*fade, 1.);
}`;

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

type Props = { section: RefObject<HTMLElement | null>; onPick: (targetIndex: number) => void };

export function StarLife({ section, onPick }: Props) {
  const { t } = useT();
  const L = t.life;
  const { timeScale } = useEggs();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const ballRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const tickRefs = useRef<(HTMLElement | null)[]>([]);
  const api = useRef<{ moveTo: (nx: number) => void; x: () => number }>(null);
  const scale = useRef(timeScale);
  const [cap, setCap] = useState<{ cur: number; prev: number | null; n: number }>({ cur: START, prev: null, n: 0 });
  const [noGL, setNoGL] = useState(false);

  useEffect(() => {
    scale.current = timeScale;
  }, [timeScale]);

  useEffect(() => {
    if (cap.prev === null) return;
    const id = setTimeout(() => setCap((c) => ({ ...c, prev: null })), 240);
    return () => clearTimeout(id);
  }, [cap.n, cap.prev]);

  useEffect(() => {
    const canvas = canvasRef.current, host = section.current, ball = ballRef.current, track = trackRef.current;
    const gl = canvas?.getContext("webgl", { antialias: false, alpha: false });
    if (!gl) setNoGL(true);
    if (!canvas || !host || !ball || !track || !gl) return;
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;

    const sh = (type: number, src: string) => {
      const s = gl.createShader(type)!;
      gl.shaderSource(s, src);
      gl.compileShader(s);
      return s;
    };
    const prog = gl.createProgram()!;
    gl.attachShader(prog, sh(gl.VERTEX_SHADER, VS));
    gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FS));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      setNoGL(true); // the GPU refused the shader: show the still star instead
      return;
    }
    gl.useProgram(prog);
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const aLoc = gl.getAttribLocation(prog, "a");
    gl.enableVertexAttribArray(aLoc);
    gl.vertexAttribPointer(aLoc, 2, gl.FLOAT, false, 0, 0);
    const U: Record<string, WebGLUniformLocation | null> = {};
    for (const n of ["res", "ctr", "rad", "fade", "t", "evo", "rot", "blur", "starX", "freq", "warp", "cells", "gas", "shell", "gI", "flick", "c0", "c1", "c2", "glow"])
      U[n] = gl.getUniformLocation(prog, n);

    // The ball sits wherever the placeholder element is laid out; the canvas covers the whole hero.
    const resize = () => {
      const dpr = Math.min(devicePixelRatio || 1, 1.5);
      const H = host.getBoundingClientRect(), B = ball.getBoundingClientRect();
      canvas.width = Math.round(H.width * dpr);
      canvas.height = Math.round(H.height * dpr);
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.uniform2f(U.res, canvas.width, canvas.height);
      const cx = B.left + B.width / 2 - H.left, cy = B.top + B.height / 2 - H.top;
      gl.uniform2f(U.ctr, (cx - H.width / 2) / H.height, (H.height / 2 - cy) / H.height);
      gl.uniform1f(U.rad, (Math.min(B.width, B.height) * 0.4) / H.height);
    };
    const ro = new ResizeObserver(resize);
    ro.observe(host);
    ro.observe(ball);

    let x = START / LAST, stage = START, omega = 14, rot = 0, evo = 0, starX = 0, lastInput = -1e9, hover = -1;
    let dragX: number | null = null;
    // Auto-advance plays one lap, and waits while the pointer or keyboard focus is on the star, its caption
    // (whose button would otherwise vanish under the cursor or the focus) or the track.
    const stageBox = ball.parentElement ?? host;
    let held = false, autoSteps = 0;
    const hold = () => (held = true);
    const release = () => (held = false);
    const focusOut = (e: FocusEvent) => {
      if (!stageBox.contains(e.relatedTarget as Node | null)) held = false;
    };
    stageBox.addEventListener("pointerenter", hold);
    stageBox.addEventListener("pointerleave", release);
    stageBox.addEventListener("focusin", hold);
    stageBox.addEventListener("focusout", focusOut);
    const cur: Look = JSON.parse(JSON.stringify(LOOK[START]));
    const tickH = new Array(N).fill(0);
    const moveTo = (nx: number) => {
      nx = clamp(nx, 0, 1);
      omega += (nx - x) * 150;
      x = nx;
      lastInput = performance.now();
    };
    api.current = { moveTo, x: () => x };

    const px = (e: PointerEvent) => {
      const r = track.getBoundingClientRect();
      return (e.clientX - r.left) / r.width;
    };
    const onTrack = (e: PointerEvent) => track.contains(e.target as Node);
    const onHover = (e: PointerEvent) => {
      hover = clamp(px(e), 0, 1);
      if (e.pointerType === "mouse" && dragX === null) moveTo(hover);
    };
    const onLeave = () => (hover = -1);
    // Drags start on the canvas (the ball) or the track, never on the hero's text and buttons.
    const onDown = (e: PointerEvent) => {
      if (e.target !== canvas && !onTrack(e)) return;
      dragX = e.clientX;
      if (onTrack(e)) moveTo(px(e));
    };
    const onMove = (e: PointerEvent) => {
      if (dragX === null) return;
      if (onTrack(e)) moveTo(px(e));
      else moveTo(x + (e.clientX - dragX) / Math.min(innerWidth, 900));
      dragX = e.clientX;
    };
    const onUp = () => (dragX = null);
    track.addEventListener("pointermove", onHover);
    track.addEventListener("pointerleave", onLeave);
    host.addEventListener("pointerdown", onDown);
    addEventListener("pointermove", onMove);
    addEventListener("pointerup", onUp);
    addEventListener("pointercancel", onUp);

    let visible = true;
    const io = new IntersectionObserver(([en]) => (visible = en.isIntersecting));
    io.observe(host);

    const t0 = performance.now();
    let nextAuto = t0 + 5000, prev = t0, raf = 0;
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      const dt = clamp((now - prev) / 1000, 0, 0.05) * scale.current;
      prev = Math.max(prev, now);
      if (!visible) return;
      const f = (r: number) => 1 - Math.exp(-dt * r);
      const time = (now - t0) / 1000;

      if (!reduced && !held && autoSteps <= LAST && now - lastInput > 5000 && now > nextAuto) {
        autoSteps++;
        x = ((Math.round(x * LAST) + 1) % (LAST + 1)) / LAST;
        omega += 9;
        nextAuto = now + 2600;
      }
      const i = Math.round(x * LAST);
      if (i !== stage) {
        omega += omega >= 0 ? 7 : -7;
        const old = stage;
        stage = i;
        setCap((c) => ({ cur: i, prev: old, n: c.n + 1 }));
      }
      const goal = LOOK[stage], k = f(reduced ? 60 : 13);
      for (const key of Object.keys(cur) as (keyof Look)[]) {
        const g = goal[key], c = cur[key];
        if (Array.isArray(c)) for (let j = 0; j < 3; j++) c[j] += ((g as number[])[j] - c[j]) * k;
        else (cur[key] as number) = c + ((g as number) - c) * k;
      }
      omega *= Math.exp(-dt * 3.6);
      const blur = Math.min(1.4, Math.abs(omega) * 0.1);
      rot += (reduced ? 0 : 0.22 + omega) * dt;
      if (!reduced) evo += dt * cur.boil * (1 + Math.abs(omega) * 0.1);
      starX += omega * dt * 0.012;

      for (const n of ["freq", "warp", "cells", "gas", "shell", "gI"] as const) gl.uniform1f(U[n], cur[n]);
      for (const n of ["c0", "c1", "c2", "glow"] as const) gl.uniform3fv(U[n], cur[n]);
      gl.uniform1f(U.t, time);
      gl.uniform1f(U.evo, evo);
      gl.uniform1f(U.rot, rot);
      gl.uniform1f(U.blur, blur);
      gl.uniform1f(U.starX, starX);
      gl.uniform1f(U.flick, reduced ? 1 : 1 + 0.1 * Math.sin(time * 2.1) + 0.06 * Math.sin(time * 5.3));
      gl.uniform1f(U.fade, Math.min(1, (now - t0) / 500));
      gl.drawArrays(gl.TRIANGLES, 0, 3);

      const active = x * (N - 1), bellAt = (hover >= 0 ? hover : x) * (N - 1), tf = f(22);
      tickRefs.current.forEach((el, j) => {
        if (!el) return;
        const q = j - bellAt, bell = Math.exp((-q * q) / 5.5), on = Math.exp(-((j - active) ** 2) / 0.22);
        const goalH = Math.max((j % PER ? 0.17 : 0.28) + bell * 0.55, on);
        tickH[j] += (goalH - tickH[j]) * tf;
        el.style.transform = `scaleY(${tickH[j]})`;
        el.style.opacity = String(0.3 + bell * 0.35 + on * 0.6);
      });
    };
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
      track.removeEventListener("pointermove", onHover);
      track.removeEventListener("pointerleave", onLeave);
      host.removeEventListener("pointerdown", onDown);
      stageBox.removeEventListener("pointerenter", hold);
      stageBox.removeEventListener("pointerleave", release);
      stageBox.removeEventListener("focusin", hold);
      stageBox.removeEventListener("focusout", focusOut);
      removeEventListener("pointermove", onMove);
      removeEventListener("pointerup", onUp);
      removeEventListener("pointercancel", onUp);
      api.current = null;
    };
  }, [section]);

  const onKey = (e: React.KeyboardEvent) => {
    const step = e.key === "ArrowRight" || e.key === "ArrowUp" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowDown" ? -1 : 0;
    if (!step || !api.current) return;
    e.preventDefault();
    e.stopPropagation();
    api.current.moveTo(clamp(Math.round(api.current.x() * LAST) + step, 0, LAST) / LAST);
  };

  const line = (i: number, out: boolean) => {
    const s = L.stages[i];
    const target = TARGET_OF[i];
    return (
      <div key={`${i}-${out ? "out" : cap.n}`} className={`absolute inset-0 text-center ${out ? "line-out" : "line-in"}`} aria-hidden={out}>
        <p className="text-[clamp(16px,2.05vh,21px)] leading-tight font-semibold tracking-[-0.012em]">{s.t}</p>
        <p className="mt-1.5 text-[clamp(12.5px,1.55vh,15px)] text-white/65">
          <b className="mr-1.5 font-medium text-white">{s.b}</b>
          {s.c}
        </p>
        {!out && target >= 0 && (
          <button
            type="button"
            onClick={() => onPick(target)}
            className="pointer-events-auto mt-2 inline-flex min-h-11 items-center gap-1.5 rounded-full border border-white/15 px-3.5 text-xs text-white/80 transition hover:-translate-y-0.5 hover:border-primary/60 hover:text-white"
          >
            {L.watch} <ArrowRight className="size-3.5" aria-hidden />
          </button>
        )}
      </div>
    );
  };

  return (
    <>
      <canvas ref={canvasRef} aria-hidden className="absolute inset-0 size-full cursor-grab touch-pan-y active:cursor-grabbing" />
      <div className="relative flex flex-col items-center">
        <div
          ref={ballRef}
          className="pointer-events-none relative aspect-square w-[min(100%,26rem)] rounded-full"
          style={noGL ? { background: "radial-gradient(circle at 40% 35%, #fff4d6, #fbbf24 30%, #c2410c 62%, transparent 71%)" } : undefined}
        >
          <span className="absolute right-0 bottom-2 font-mono text-[10px] tracking-[0.2em] text-white/55 uppercase">{L.illustration}</span>
        </div>
        <div className="relative mt-1 h-[100px] w-full max-w-md">
          {cap.prev !== null && line(cap.prev, true)}
          {line(cap.cur, false)}
        </div>
        <div
          ref={trackRef}
          role="slider"
          tabIndex={0}
          aria-label={L.label}
          aria-valuemin={0}
          aria-valuemax={LAST}
          aria-valuenow={cap.cur}
          aria-valuetext={`${L.stages[cap.cur].b}, ${L.stages[cap.cur].t}`}
          onKeyDown={onKey}
          className="relative mt-3 h-16 w-[min(26rem,84vw)] cursor-pointer touch-none rounded-sm outline-none before:absolute before:-inset-x-7 before:-inset-y-2 before:content-[''] focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <div className="pointer-events-none absolute inset-x-0 top-0 flex h-11 items-end justify-between">
            {Array.from({ length: N }, (_, j) => (
              <i
                key={j}
                ref={(el) => {
                  tickRefs.current[j] = el;
                }}
                className="block h-11 w-[1.5px] origin-bottom bg-white will-change-transform"
              />
            ))}
          </div>
          <div className="pointer-events-none absolute inset-x-0 top-[54px] flex justify-between text-[12.5px] text-white/60">
            <span className={cap.cur === 0 ? "font-medium text-white" : ""}>{L.start}</span>
            <span className={cap.cur === LAST ? "font-medium text-white" : ""}>{L.end}</span>
          </div>
        </div>
        <p className="mt-2 max-w-[26rem] text-center text-xs leading-relaxed text-white/60">{L.branches}</p>
      </div>
    </>
  );
}
