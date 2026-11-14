"use client";

import { useEffect, useState } from "react";
import { createJob, getJob, InputError, NotFoundError, type Job } from "./api";
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
        const create = () => createJob(target.ra, target.dec, target.fov, findTarget(target.ra, target.dec)?.simbad);
        let id = await create();
        let retried = false;
        while (!cancelled) {
          let job: Job;
          try {
            job = await getJob(id);
          } catch (e) {
            // The server may have restarted and forgotten the job: ask for it again, once.
            if (!(e instanceof NotFoundError) || retried) throw e;
            retried = true;
            id = await create();
            continue;
          }
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
