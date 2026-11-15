"use client";

import { useEffect, useState } from "react";
import { createJob, getJob, InputError, NotFoundError, ServerError, type Job } from "./api";
import { findTarget } from "./targets";

export type Target = { ra: number; dec: number; fov: number };

/** network: no answer at all · server: the API kept answering 5xx · slow: no progress for a long time. */
export type JobError = "network" | "server" | "slow";

type Result = { key: string; job: Job | null; error: JobError | null; inputError: boolean };

const EMPTY = { job: null, error: null, inputError: false };
const POLL_MS = 1500;
// A busy archive or a restarting API answers 5xx or not at all for a few seconds: wait longer each time.
const BACKOFF_MS = [1500, 3000, 6000, 10000, 10000];
const STALL_MS = 10 * 60 * 1000;

const sleep = (ms: number, onTimer: (t: ReturnType<typeof setTimeout>) => void) =>
  new Promise((r) => onTimer(setTimeout(r, ms)));

export function useJob(target: Target | null, run: number) {
  const key = target ? `${target.ra},${target.dec},${target.fov},${run}` : "";
  const [result, setResult] = useState<Result>({ key: "", ...EMPTY });

  useEffect(() => {
    if (!target) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let last: Job | null = null;
    const update = (r: Partial<Result>) => {
      if (!cancelled) setResult({ key, ...EMPTY, job: last, ...r });
    };
    const wait = (ms: number) => sleep(ms, (t) => (timer = t));

    /** Runs `call`, retrying network errors and 5xx with growing pauses; other errors pass through. */
    const withRetry = async <T,>(call: () => Promise<T>): Promise<T> => {
      for (let attempt = 0; ; attempt++) {
        try {
          return await call();
        } catch (e) {
          const transient = e instanceof ServerError || e instanceof TypeError;
          if (!transient || attempt >= BACKOFF_MS.length || cancelled) throw e;
          console.warn(`SkyBlink API: ${e instanceof Error ? e.message : e}; retrying`);
          await wait(BACKOFF_MS[attempt]);
        }
      }
    };

    (async () => {
      try {
        const create = () => withRetry(() => createJob(target.ra, target.dec, target.fov, findTarget(target.ra, target.dec)?.simbad));
        let id = await create();
        let recreated = false;
        let progressAt = Date.now();
        while (!cancelled) {
          let job: Job;
          try {
            job = await withRetry(() => getJob(id));
          } catch (e) {
            // The server may have restarted and forgotten the job: ask for it again, once.
            if (!(e instanceof NotFoundError) || recreated) throw e;
            recreated = true;
            id = await create();
            continue;
          }
          if (job.progress.frames_done !== last?.progress.frames_done || job.status !== last?.status) progressAt = Date.now();
          last = job;
          update({});
          if (job.status === "done" || job.status === "failed") return;
          if (Date.now() - progressAt > STALL_MS) return update({ error: "slow" });
          await wait(POLL_MS);
        }
      } catch (e) {
        if (cancelled) return;
        console.error("SkyBlink API:", e);
        if (e instanceof InputError) update({ inputError: true });
        else update({ error: e instanceof ServerError || e instanceof NotFoundError ? "server" : "network" });
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
