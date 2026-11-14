import argparse
import time

import httpx

TARGETS = {
    "Barnard's Star": (269.4462, 4.7682),
    "Epsilon Indi B": (331.0967, -56.8007),
    "WISE 0855": (133.7951, -7.2451),
    "RW Aurigae": (76.9562, 30.4012),
    "R Draconis": (248.1675, 66.7550),
}
FINISHED = ("done", "failed")


def run_job(
    client: httpx.Client, ra: float, dec: float, detector: str, poll_s: float, timeout_s: float
) -> dict:
    created = client.post("/jobs", json={"ra": ra, "dec": dec, "fov_arcmin": 6, "detectors": [detector]})
    created.raise_for_status()
    job_id = created.json()["job_id"]
    deadline = time.monotonic() + timeout_s
    while True:
        body = client.get(f"/jobs/{job_id}").json()
        if body["status"] in FINISHED or time.monotonic() > deadline:
            return {"job_id": job_id, **body}
        time.sleep(poll_s)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("base_url")
    parser.add_argument("--detector", default="D6")
    parser.add_argument("--poll-s", type=float, default=3.0)
    parser.add_argument("--timeout-s", type=float, default=900.0)
    args = parser.parse_args()
    with httpx.Client(base_url=args.base_url.rstrip("/"), timeout=60) as client:
        for name, (ra, dec) in TARGETS.items():
            started = time.monotonic()
            body = run_job(client, ra, dec, args.detector, args.poll_s, args.timeout_s)
            frames = body["frames"]
            ready = sum(f["status"] == "ready" for f in frames)
            alerts = sorted(
                {a["code"] for a in body["alerts"]} | {a["code"] for f in frames for a in f["alerts"]}
            )
            print(
                f"{name:15} {time.monotonic() - started:6.0f}s  status={body['status']:8} "
                f"frames {ready}/{len(frames)} ready, seasons={len(body['seasons'])}, "
                f"alerts={','.join(alerts) or '-'}  job={body['job_id']}",
                flush=True,
            )


if __name__ == "__main__":
    main()
