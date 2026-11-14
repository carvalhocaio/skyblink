"use client";

// Simplified, not-to-scale 3D SPHEREx: three nested conical photon shields around a small
// telescope, a focal-plane block, a hexagonal bus and one solar panel. Drag to orbit; tap a part.
import { useEffect, useRef } from "react";

export const PARTS = ["shields", "telescope", "detectors", "panel", "bus"] as const;

type Props = { selected: number; onSelect: (i: number) => void; label: string };

export function SpherexModel({ selected, onSelect, label }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const sel = useRef(selected);
  const pick = useRef(onSelect);
  const highlight = useRef<(i: number) => void>(() => {});

  useEffect(() => {
    pick.current = onSelect;
  }, [onSelect]);
  useEffect(() => {
    sel.current = selected;
    highlight.current(selected);
  }, [selected]);

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    let disposed = false;
    let cleanup = () => {};

    // Load three.js only once the section is near the viewport.
    const io = new IntersectionObserver(async ([en]) => {
      if (!en.isIntersecting) return;
      io.disconnect();
      const THREE = await import("three");
      const { OrbitControls } = await import("three/examples/jsm/controls/OrbitControls.js");
      if (disposed) return;
      const still = matchMedia("(prefers-reduced-motion: reduce)").matches;

      let renderer: InstanceType<typeof THREE.WebGLRenderer>;
      try {
        renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      } catch {
        return;
      }
      renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      el.appendChild(renderer.domElement);
      renderer.domElement.style.cursor = "grab";

      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 100);
      camera.position.set(6.5, 3.2, 7.5);
      scene.add(new THREE.AmbientLight(0x8899bb, 0.9));
      const sun = new THREE.DirectionalLight(0xfff1dd, 2.6);
      sun.position.set(5, 4, 3);
      scene.add(sun);
      const rim = new THREE.DirectionalLight(0x67e8f9, 1.1);
      rim.position.set(-4, 2, -5);
      scene.add(rim);

      const model = new THREE.Group();
      model.position.y = -0.2;
      scene.add(model);
      const groups: InstanceType<typeof THREE.Mesh>[][] = PARTS.map(() => []);
      const add = (part: number, mesh: InstanceType<typeof THREE.Mesh>) => {
        mesh.userData.part = part;
        groups[part].push(mesh);
        model.add(mesh);
        return mesh;
      };
      const metal = (color: number, roughness = 0.35, metalness = 0.85) =>
        new THREE.MeshStandardMaterial({ color, roughness, metalness, side: THREE.DoubleSide });

      // Photon shields: three nested open cones, widest on the outside.
      [
        [1.55, 0.85, 2.0],
        [1.85, 0.95, 2.3],
        [2.15, 1.05, 2.6],
      ].forEach(([top, bottom, h], k) => {
        const m = add(0, new THREE.Mesh(new THREE.CylinderGeometry(top, bottom, h, 64, 1, true), metal(0xd9dde3, 0.28 + k * 0.05)));
        m.position.y = 0.35 + h / 2 - 1;
      });
      // Telescope tube with a dark aperture.
      add(1, new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 1.5, 40), metal(0x3a3f48, 0.5, 0.6))).position.y = 0.3;
      add(1, new THREE.Mesh(new THREE.CircleGeometry(0.38, 40), new THREE.MeshStandardMaterial({ color: 0x05070a, roughness: 1 })))
        .rotateX(-Math.PI / 2)
        .position.set(0, 1.06, 0);
      // Focal plane: a block with a rainbow strip for the six detectors.
      add(2, new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.22, 0.95), metal(0x6b5b95, 0.4, 0.5))).position.y = -0.55;
      ["#7c3aed", "#2563eb", "#0891b2", "#059669", "#ca8a04", "#dc2626"].forEach((c, k) => {
        const tile = add(2, new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.04, 0.5), new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 0.6 })));
        tile.position.set(-0.36 + k * 0.145, -0.42, 0);
      });
      // Bus: gold-foil hexagonal prism.
      add(4, new THREE.Mesh(new THREE.CylinderGeometry(0.95, 0.95, 0.8, 6), metal(0xc9a227, 0.45, 0.9))).position.y = -1.1;
      // Solar panel on one side.
      const panel = add(3, new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.06, 1.3), new THREE.MeshStandardMaterial({ color: 0x1e3a8a, roughness: 0.3, metalness: 0.6 })));
      panel.position.set(-1.95, -1.15, 0);
      panel.rotation.z = 0.12;
      const grid = new THREE.LineSegments(
        new THREE.EdgesGeometry(new THREE.BoxGeometry(2.1, 0.07, 1.3, 6, 1, 4)),
        new THREE.LineBasicMaterial({ color: 0x93c5fd, transparent: true, opacity: 0.35 }),
      );
      panel.add(grid);

      // A few background stars.
      const pts = new Float32Array(600);
      for (let i = 0; i < pts.length; i++) pts[i] = (Math.random() - 0.5) * 60;
      const starGeo = new THREE.BufferGeometry();
      starGeo.setAttribute("position", new THREE.BufferAttribute(pts, 3));
      scene.add(new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0xffffff, size: 0.06, transparent: true, opacity: 0.7 })));

      const controls = new OrbitControls(camera, renderer.domElement);
      controls.enableZoom = false;
      controls.enablePan = false;
      controls.enableDamping = true;
      controls.autoRotate = !still;
      controls.autoRotateSpeed = 1.2;
      controls.target.set(0, 0, 0);
      controls.addEventListener("start", () => (renderer.domElement.style.cursor = "grabbing"));
      controls.addEventListener("end", () => (renderer.domElement.style.cursor = "grab"));

      highlight.current = (part: number) =>
        groups.forEach((meshes, i) =>
          meshes.forEach((m) => {
            const mat = m.material as InstanceType<typeof THREE.MeshStandardMaterial>;
            if (!("emissive" in mat) || i === 2) return; // detector tiles keep their own glow
            mat.emissive.set(i === part ? 0x22d3ee : 0x000000);
            mat.emissiveIntensity = i === part ? 0.35 : 0;
          }),
        );
      highlight.current(sel.current);

      // Tap (not drag) picks the part under the pointer.
      const ray = new THREE.Raycaster();
      let down: { x: number; y: number } | null = null;
      const onDown = (e: PointerEvent) => (down = { x: e.clientX, y: e.clientY });
      const onUp = (e: PointerEvent) => {
        if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 5) return;
        const r = renderer.domElement.getBoundingClientRect();
        ray.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), camera);
        const hit = ray.intersectObjects(model.children, false)[0];
        if (hit && hit.object.userData.part !== undefined) pick.current(hit.object.userData.part as number);
      };
      renderer.domElement.addEventListener("pointerdown", onDown);
      renderer.domElement.addEventListener("pointerup", onUp);

      const resize = () => {
        const w = el.clientWidth, h = el.clientHeight;
        renderer.setSize(w, h);
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
      };
      const ro = new ResizeObserver(resize);
      ro.observe(el);
      resize();

      let visible = true;
      const vis = new IntersectionObserver(([x]) => (visible = x.isIntersecting));
      vis.observe(el);
      let raf = 0;
      const loop = () => {
        raf = requestAnimationFrame(loop);
        if (!visible) return;
        controls.update();
        renderer.render(scene, camera);
      };
      loop();

      cleanup = () => {
        cancelAnimationFrame(raf);
        ro.disconnect();
        vis.disconnect();
        controls.dispose();
        renderer.domElement.removeEventListener("pointerdown", onDown);
        renderer.domElement.removeEventListener("pointerup", onUp);
        scene.traverse((o) => {
          const m = o as InstanceType<typeof THREE.Mesh>;
          m.geometry?.dispose();
          const mat = m.material as { dispose?: () => void } | undefined;
          mat?.dispose?.();
        });
        renderer.dispose();
        renderer.domElement.remove();
      };
    }, { rootMargin: "200px" });
    io.observe(el);

    return () => {
      disposed = true;
      io.disconnect();
      cleanup();
    };
  }, []);

  return <div ref={host} role="img" aria-label={label} className="relative aspect-square w-full touch-pan-y" />;
}
