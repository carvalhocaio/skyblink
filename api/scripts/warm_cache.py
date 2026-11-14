import argparse
import time

import httpx

TARGETS = {
    "Barnard's Star": (269.4462, 4.7682, "Barnard's star"),
    "Epsilon Indi B": (331.0967, -56.8007, "eps Ind B"),
    "WISE 0855": (133.7601, -7.2423, "WISE 0855-0714"),
    "RW Aurigae": (76.9562, 30.4012, "RW Aur"),
    "R Draconis": (248.1675, 66.7550, "R Dra"),
}
FINISHED = ("done", "failed")


def run_job(client: httpx.Client, request: dict, poll_s: float, timeout_s: float) -> dict:
    created = client.post("/jobs", json=request)
    created.raise_for_status()
    job_id = created.json()["job_id"]
    deadline = time.monotonic() + timeout_s
    while True:
        body = client.get(f"/jobs/{job_id}").json()
        if body["status"] in FINISHED or time.monotonic() > deadline:
            return {"job_id": job_id, **body}
        time.sleep(poll_s)


def describe_motion(body: dict) -> str:
    motion = body.get("motion")
    if motion is None:
        return f"motion=null ({body.get('motion_reason')})"
    rate = motion["rate_arcsec_yr"]
    text = f'motion={rate["value"]:.2f}±{rate["error"]:.2f}"/yr'
    catalog = motion.get("catalog")
    if catalog is not None:
        predicted, residual = catalog["predicted_rate_arcsec_yr"], catalog["rate_residual_sigma"]
        text += f" vs {predicted:.2f} predicted ({residual:+.2f}σ, {catalog['name']}: {catalog['object']})"
    if motion.get("catalog_reason"):
        text += f" catalog_reason={motion['catalog_reason']}"
    return text


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("base_url")
    parser.add_argument("--detector", default="D6")
    parser.add_argument(
        "--targets", nargs="*", choices=list(TARGETS), help="subset of targets; all when omitted"
    )
    parser.add_argument("--names", action="store_true", help="send each target's SIMBAD name as target_name")
    parser.add_argument("--poll-s", type=float, default=3.0)
    parser.add_argument("--timeout-s", type=float, default=900.0)
    args = parser.parse_args()
    with httpx.Client(base_url=args.base_url.rstrip("/"), timeout=60) as client:
        for name, (ra, dec, simbad_name) in TARGETS.items():
            if args.targets and name not in args.targets:
                continue
            request = {"ra": ra, "dec": dec, "fov_arcmin": 6, "detectors": [args.detector]}
            if args.names:
                request["target_name"] = simbad_name
            started = time.monotonic()
            body = run_job(client, request, args.poll_s, args.timeout_s)
            frames = body["frames"]
            ready = sum(f["status"] == "ready" for f in frames)
            alerts = sorted(
                {a["code"] for a in body["alerts"]} | {a["code"] for f in frames for a in f["alerts"]}
            )
            print(
                f"{name:15} {time.monotonic() - started:5.1f}s status={body['status']} "
                f"frames {ready}/{len(frames)} alerts={','.join(alerts) or '-'} {describe_motion(body)} "
                f"job={body['job_id']}",
                flush=True,
            )


if __name__ == "__main__":
    main()
