"use client";

// 8/8 reward: eight coloured spheres (one per physicist) spiral into one bright star, a ring
// flashes out, then a card offers the Blink Hunter game.
import { useEffect, useRef, useState } from "react";
import { Gamepad2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useT } from "@/lib/i18n";

const COLORS = [0xef4444, 0xf59e0b, 0xeab308, 0x22c55e, 0x22d3ee, 0x3b82f6, 0xa855f7, 0xec4899];
const MERGE = 2.6; // seconds until the spheres meet

export default function Finale({ onPlay, onClose }: { onPlay: () => void; onClose: () => void }) {
  const { t } = useT();
  const f = t.finale;
  const dlg = useRef<HTMLDialogElement>(null);
  const host = useRef<HTMLDivElement>(null);
  const [noGL, setNoGL] = useState(false);

  useEffect(() => {
    dlg.current?.showModal();
    // The card fades in after about 3 s: hold focus on the dialog until then, so the focused button is visible.
    dlg.current?.focus();
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const id = setTimeout(() => dlg.current?.querySelector<HTMLElement>("[data-autofocus]")?.focus(), reduced ? 0 : 3500);
    return () => clearTimeout(id);
  }, []);

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    let stop = false;
    let cleanup = () => {};
    (async () => {
      const THREE = await import("three");
      if (stop) return;
      const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
      let renderer: InstanceType<typeof THREE.WebGLRenderer>;
      try {
        renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      } catch {
        setNoGL(true);
        return;
      }
      renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      el.appendChild(renderer.domElement);
      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 100);
      camera.position.set(0, 2.2, 7);
      camera.lookAt(0, 0, 0);
      scene.add(new THREE.AmbientLight(0xffffff, 0.6));
      const light = new THREE.PointLight(0xffffff, 0, 20);
      scene.add(light);

      const balls = COLORS.map((c) => {
        const m = new THREE.Mesh(new THREE.SphereGeometry(0.3, 32, 16), new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 0.7 }));
        scene.add(m);
        return m;
      });
      const star = new THREE.Mesh(new THREE.SphereGeometry(0.6, 48, 24), new THREE.MeshBasicMaterial({ color: 0xe0fbff }));
      scene.add(star);
      // Soft glow: a radial-gradient sprite.
      const c = document.createElement("canvas");
      c.width = c.height = 128;
      const g = c.getContext("2d")!;
      const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
      grad.addColorStop(0, "rgba(103,232,249,0.9)");
      grad.addColorStop(0.4, "rgba(34,211,238,0.25)");
      grad.addColorStop(1, "rgba(34,211,238,0)");
      g.fillStyle = grad;
      g.fillRect(0, 0, 128, 128);
      const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false }));
      scene.add(glow);
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(0.95, 1, 96),
        new THREE.MeshBasicMaterial({ color: 0x67e8f9, transparent: true, side: THREE.DoubleSide }),
      );
      ring.rotation.x = -Math.PI / 2.4;
      scene.add(ring);
      const pts = new Float32Array(900);
      for (let i = 0; i < pts.length; i++) pts[i] = (Math.random() - 0.5) * 40;
      const sg = new THREE.BufferGeometry();
      sg.setAttribute("position", new THREE.BufferAttribute(pts, 3));
      scene.add(new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xffffff, size: 0.05, transparent: true, opacity: 0.7 })));

      const resize = () => {
        const w = el.clientWidth, h = el.clientHeight;
        renderer.setSize(w, h);
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
      };
      const ro = new ResizeObserver(resize);
      ro.observe(el);
      resize();

      const ease = (x: number) => 1 - Math.pow(1 - Math.min(Math.max(x, 0), 1), 3);
      const frame = (time: number) => {
        const k = ease(time / MERGE); // 0 → 1 as the spheres converge
        balls.forEach((b, i) => {
          const a = (i / balls.length) * Math.PI * 2 + time * (1.2 + k * 3);
          const r = 2.6 * (1 - k);
          b.position.set(Math.cos(a) * r, Math.sin(time * 2 + i) * 0.3 * (1 - k), Math.sin(a) * r);
          b.scale.setScalar(1 - k * 0.9);
          b.visible = k < 1;
        });
        const burst = Math.max(0, time - MERGE);
        const s = ease(burst / 0.6) * (1 + Math.sin(time * 3) * 0.04);
        star.scale.setScalar(Math.max(s, 0.001));
        glow.scale.setScalar(5 * s);
        light.intensity = 30 * s;
        const rk = Math.min(burst / 1.4, 1);
        ring.scale.setScalar(0.5 + rk * 3.2);
        (ring.material as InstanceType<typeof THREE.MeshBasicMaterial>).opacity = burst > 0 ? 1 - rk : 0;
        renderer.render(scene, camera);
      };

      let raf = 0;
      if (still) frame(MERGE + 0.6);
      else {
        const t0 = performance.now();
        const loop = () => {
          raf = requestAnimationFrame(loop);
          frame((performance.now() - t0) / 1000);
        };
        loop();
      }
      cleanup = () => {
        cancelAnimationFrame(raf);
        ro.disconnect();
        scene.traverse((o) => {
          const m = o as InstanceType<typeof THREE.Mesh>;
          m.geometry?.dispose();
          (m.material as { dispose?: () => void } | undefined)?.dispose?.();
        });
        renderer.dispose();
        renderer.domElement.remove();
      };
    })();
    return () => {
      stop = true;
      cleanup();
    };
  }, []);

  return (
    <dialog
      ref={dlg}
      onClose={onClose}
      tabIndex={-1}
      aria-labelledby="finale-title"
      className="m-auto outline-none w-[min(32rem,calc(100vw-2rem))] max-h-[92dvh] overflow-y-auto rounded-2xl border bg-card p-0 text-foreground shadow-2xl backdrop:bg-black/75 backdrop:backdrop-blur-sm"
    >
      <button type="button" onClick={() => dlg.current?.close()} aria-label={t.game.close} className="absolute top-2 right-2 z-10 flex size-11 items-center justify-center rounded-full text-muted-foreground hover:text-foreground">
        <X className="size-5" aria-hidden />
      </button>
      <div
        ref={host}
        aria-hidden
        className="h-56 w-full bg-[radial-gradient(ellipse_at_50%_50%,oklch(0.25_0.06_220/0.7),transparent_70%)] sm:h-64"
        style={noGL ? { background: "radial-gradient(circle, #e0fbff 0 18%, #22d3ee55 30%, transparent 60%)" } : undefined}
      />
      <div className="space-y-4 px-6 pb-6 text-center">
        <p className="font-mono text-xs tracking-[0.2em] text-primary uppercase">{f.kicker}</p>
        <h2 id="finale-title" className="text-2xl font-semibold tracking-tight">{f.title}</h2>
        <p className="text-sm text-muted-foreground">{f.text}</p>
        <div className="finale-card mt-2 rounded-xl border border-primary/40 bg-primary/5 p-5 text-left">
          <div className="flex items-start gap-4">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary">
              <Gamepad2 className="size-5" aria-hidden />
            </span>
            <div>
              <p className="font-medium">{f.cardTitle}</p>
              <p className="mt-1 text-sm text-muted-foreground">{f.cardText}</p>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button className="h-11 rounded-full px-5" onClick={onPlay} data-autofocus>
              {f.play}
            </Button>
            <Button variant="ghost" className="h-11 rounded-full px-5" onClick={() => dlg.current?.close()}>
              {f.later}
            </Button>
          </div>
        </div>
      </div>
    </dialog>
  );
}
