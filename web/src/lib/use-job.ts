"use client";

import { useEffect, useState } from "react";
import { createJob, getJob, InputError, type Job } from "./api";
import { findTarget } from "./targets";

export type Target = { ra: number; dec: number; fov: number };

type Result = { key: string; job: Job | null; error: string | null; inputError: string | null };

const EMPTY = { job: null, error: null, inputError: null };

export function useJob(target: Target | null, run: number) {
  const key = target ? `${target.ra},${target.dec},${target.fov},${run}` : "";
  const [result, setResult] = useState<Result>({ key: "", ...EMPTY });

  useEffect(() => {
    if (!target) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    const update = (r: Partial<Result>) => {
      if (!cancelled) setResult({ key, ...EMPTY, ...r });
    };

    (async () => {
      try {
        const id = await createJob(target.ra, target.dec, target.fov, findTarget(target.ra, target.dec)?.simbad);
        while (!cancelled) {
          const job = await getJob(id);
          update({ job });
          if (job.status === "done" || job.status === "failed") return;
          await new Promise((r) => (timer = setTimeout(r, 1500)));
        }
      } catch (e) {
        if (e instanceof InputError) update({ inputError: e.message });
        else update({ error: "We couldn't reach the SkyBlink server. Check your connection and try again." });
      }
    })();

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- key captures target and run
  }, [key]);

  return result.key === key ? result : EMPTY;
}
