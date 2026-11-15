"use client";

import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useT } from "@/lib/i18n";
import { GLOSSARY, glossParts, type Entry } from "@/lib/glossary";

/** Text with its jargon underlined; each word opens a one-line explanation. Never use inside a button. */
export function Gloss({ text }: { text: string }) {
  const { lang } = useT();
  return (
    <>
      {glossParts(text, GLOSSARY[lang]).map((p, i) => (typeof p === "string" ? p : <Term key={i} word={p.word} entry={p.entry} />))}
    </>
  );
}

const W = 288;

function Term({ word, entry }: { word: string; entry: Entry }) {
  const [at, setAt] = useState<{ x: number; y: number; up: boolean } | null>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const tip = useRef<HTMLSpanElement>(null);
  const id = useId();
  const pinned = useRef(false); // opened by click/tap: stays until dismissed
  // A short grace period lets the mouse travel from the word to its tooltip without it closing.
  const leaving = useRef<ReturnType<typeof setTimeout>>(undefined);
  const stay = () => clearTimeout(leaving.current);
  const leaveSoon = (e: React.PointerEvent) => {
    if (e.pointerType !== "mouse" || pinned.current) return;
    stay();
    leaving.current = setTimeout(() => setAt(null), 200);
  };
  useEffect(() => stay, []);

  const open = () => {
    const r = btn.current!.getBoundingClientRect();
    const up = r.bottom + 140 > innerHeight; // no room below: open above
    setAt({ x: Math.min(Math.max(8, r.left + r.width / 2 - W / 2), innerWidth - W - 8), y: up ? r.top - 8 : r.bottom + 8, up });
  };
  const close = () => {
    pinned.current = false;
    setAt(null);
  };

  useEffect(() => {
    if (!at) return;
    const away = (e: PointerEvent) => !btn.current?.contains(e.target as Node) && !tip.current?.contains(e.target as Node) && close();
    const esc = (e: KeyboardEvent) => e.key === "Escape" && close();
    addEventListener("pointerdown", away);
    addEventListener("keydown", esc);
    addEventListener("scroll", close, { passive: true, capture: true });
    return () => {
      removeEventListener("pointerdown", away);
      removeEventListener("keydown", esc);
      removeEventListener("scroll", close, { capture: true });
    };
  }, [at]);

  return (
    <>
      <button
        ref={btn}
        type="button"
        aria-expanded={!!at}
        aria-describedby={at ? id : undefined}
        onClick={() => {
          if (pinned.current) return close();
          pinned.current = true;
          open();
        }}
        onPointerEnter={(e) => {
          stay();
          if (e.pointerType === "mouse" && !at) open();
        }}
        onPointerLeave={leaveSoon}
        className="cursor-help text-inherit underline decoration-primary/70 decoration-dotted decoration-2 underline-offset-4 transition-colors hover:text-primary"
      >
        {word}
      </button>
      {/* Portal: a backdrop-blur ancestor would make `fixed` relative to that card instead of the screen. */}
      {at && createPortal(
        <span
          ref={tip}
          id={id}
          role="tooltip"
          onPointerEnter={stay}
          onPointerLeave={leaveSoon}
          className="egg-toast fixed z-[70] block rounded-xl border bg-popover p-4 text-left text-sm leading-relaxed text-popover-foreground shadow-2xl"
          style={{ left: at.x, top: at.y, width: W, maxWidth: "calc(100vw - 16px)", transform: at.up ? "translateY(-100%)" : undefined, animationDuration: "0.2s" }}
        >
          <b className="block text-primary">{entry.title}</b>
          {entry.text}
        </span>,
        document.body,
      )}
    </>
  );
}
