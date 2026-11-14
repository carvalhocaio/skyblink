"use client";

import { useEffect, useRef } from "react";
import { useEggs } from "@/lib/eggs";

// Fixed starfield behind the page: three depth layers drift slowly and follow the pointer.
// A few "nearby" stars hop now and then, the way Barnard's Star does between SPHEREx seasons.
export function Sky() {
  const ref = useRef<HTMLCanvasElement>(null);
  const { timeScale } = useEggs();
  const scale = useRef(timeScale);
  useEffect(() => {
    scale.current = timeScale;
  }, [timeScale]);

  useEffect(() => {
    const c = ref.current;
    const ctx = c?.getContext("2d");
    if (!c || !ctx) return;
    const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const dpr = Math.min(devicePixelRatio, 2);
    let w = 0, h = 0;
    type Star = { x: number; y: number; z: number; r: number; hue: number; hop: boolean };
    let stars: Star[] = [];
    const seed = () => {
      w = innerWidth;
      h = innerHeight;
      c.width = w * dpr;
      c.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      stars = Array.from({ length: Math.round((w * h) / 5200) }, () => {
        const z = Math.random() ** 2;
        return { x: Math.random() * w, y: Math.random() * h, z, r: 0.4 + z * 1.4, hue: Math.random(), hop: Math.random() < 0.02 };
      });
    };
    seed();

    const ptr = { x: 0, y: 0, tx: 0, ty: 0 };
    const onMove = (e: PointerEvent) => {
      ptr.tx = e.clientX / w - 0.5;
      ptr.ty = e.clientY / h - 0.5;
    };
    let raf = 0, last = performance.now(), clock = 0, hopTick = 0;
    const draw = (now: number) => {
      const dt = Math.min(64, Math.max(0, now - last)) * scale.current;
      last = now;
      clock += dt;
      ptr.x += (ptr.tx - ptr.x) * 0.04;
      ptr.y += (ptr.ty - ptr.y) * 0.04;
      ctx.clearRect(0, 0, w, h);
      const hop = Math.floor(clock / 1400) !== hopTick;
      if (hop) hopTick = Math.floor(clock / 1400);
      for (const s of stars) {
        s.x -= dt * 0.004 * (0.2 + s.z);
        if (s.x < -4) s.x += w + 8;
        if (s.hop && hop) s.x += 3;
        const x = s.x - ptr.x * 30 * s.z;
        const y = s.y - ptr.y * 30 * s.z - scrollY * 0.05 * s.z;
        const yy = ((y % h) + h) % h;
        const tw = 0.65 + 0.35 * Math.sin(clock * 0.002 + s.hue * 40);
        ctx.fillStyle = s.hue > 0.92 ? `rgba(253,224,171,${tw})` : s.hue > 0.8 ? `rgba(165,243,252,${tw})` : `rgba(255,255,255,${tw * (0.35 + s.z * 0.6)})`;
        ctx.beginPath();
        ctx.arc(x, yy, s.r, 0, Math.PI * 2);
        ctx.fill();
      }
      if (!still) raf = requestAnimationFrame(draw);
    };
    draw(last);
    addEventListener("resize", seed);
    if (!still) addEventListener("pointermove", onMove);
    return () => {
      cancelAnimationFrame(raf);
      removeEventListener("resize", seed);
      removeEventListener("pointermove", onMove);
    };
  }, []);

  return <canvas ref={ref} aria-hidden className={`pointer-events-none fixed inset-0 -z-10 size-full transition-[filter] duration-1000 ${timeScale < 1 ? "hue-rotate-60 saturate-200" : ""}`} />;
}
