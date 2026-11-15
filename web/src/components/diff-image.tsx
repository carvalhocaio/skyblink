"use client";

import { useEffect, useRef } from "react";

// Diverging pair, kept apart from the cyan/amber measured/predicted identities: blue = brighter now, red = brighter in
// the first picture, black = no change.
export const DIFF_NOW: [number, number, number] = [96, 165, 250];
export const DIFF_BEFORE: [number, number, number] = [248, 113, 113];

// Frames of one detector share a brightness scale fixed on its first frame, so their 8-bit values are comparable for
// the eye. They are asinh-stretched and clipped, though: this is a picture to look at, not a photometric difference.
const cache = new Map<string, Promise<HTMLImageElement>>();
function load(url: string) {
  if (!cache.has(url)) {
    cache.set(
      url,
      new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = "anonymous"; // readable pixels need CORS; the API sends it for the site's own origin
        img.onload = () => resolve(img);
        img.onerror = () => {
          cache.delete(url);
          reject(new Error(`could not load ${url}`));
        };
        // A separate URL so a cached non-CORS copy of the same PNG is never reused for the canvas.
        img.src = `${url}${url.includes("?") ? "&" : "?"}diff`;
      }),
    );
  }
  return cache.get(url)!;
}

function pixels(img: HTMLImageElement) {
  const c = document.createElement("canvas");
  c.width = img.naturalWidth;
  c.height = img.naturalHeight;
  const ctx = c.getContext("2d")!;
  ctx.drawImage(img, 0, 0);
  return ctx.getImageData(0, 0, c.width, c.height);
}

/** current − first, drawn on a black background: blue where it got brighter, red where it got dimmer. */
export function DiffImage({ first, current, onError }: { first: string; current: string; onError: () => void }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    let live = true;
    Promise.all([load(first), load(current)])
      .then(([a, b]) => {
        const canvas = ref.current;
        if (!live || !canvas) return;
        const pa = pixels(a), pb = pixels(b);
        if (pa.width !== pb.width || pa.height !== pb.height) throw new Error("frames differ in size");
        canvas.width = pa.width;
        canvas.height = pa.height;
        const ctx = canvas.getContext("2d")!;
        const out = ctx.createImageData(pa.width, pa.height);
        for (let i = 0; i < pa.data.length; i += 4) {
          const d = (pb.data[i] - pa.data[i]) / 255; // grayscale PNGs: the red channel is the value
          const [r, g, bl] = d >= 0 ? DIFF_NOW : DIFF_BEFORE;
          const k = Math.min(1, Math.abs(d) * 2); // ×2 so faint changes stay visible
          out.data[i] = r * k;
          out.data[i + 1] = g * k;
          out.data[i + 2] = bl * k;
          out.data[i + 3] = 255;
        }
        ctx.putImageData(out, 0, 0);
      })
      .catch((e) => {
        console.warn("SkyBlink difference image:", e);
        if (live) onError();
      });
    return () => {
      live = false;
    };
  }, [first, current, onError]);
  return <canvas ref={ref} aria-hidden className="absolute inset-0 size-full" style={{ imageRendering: "pixelated" }} />;
}
