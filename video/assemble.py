"""Cut, join, voice, caption and check the demo video; export one still per scene.

Reads out/scenes/*.webm (record.py), out/voice.mp3 and out/captions.srt. Each scene is cut from its
sync point (the first frame after the magenta sync frame) for exactly its window in timeline.py.

Usage: uv run assemble.py   (writes out/skyblink-demo.mp4 and out/stills/*.png)
"""

import json
import subprocess
import urllib.request
from pathlib import Path

from timeline import OUT, scene_windows

BUILD = OUT / "build"
SCENE_DIR = OUT / "scenes"
FONTS = OUT / "fonts"
FINAL = OUT / "skyblink-demo.mp4"
MAX_SECONDS = 29.5
FPS = 30
# Static Mona Sans SemiBold (SIL Open Font License), the site's typeface, for the captions.
FONT_URL = "https://fonts.gstatic.com/s/monasans/v4/o-0mIpQmx24alC5A4PNB6Ryti20_6n1iPHjcz6L1SoM-jCpoiyAjBN9d.ttf"
# SRT styles are in libass's default 384x288 canvas: x3.75 for 1080p. White text on a ~60% dark box,
# bottom centre, 64 px above the frame edge (the player's crosshair sits in the upper half).
CAPTION_STYLE = (
    "FontName=Mona Sans SemiBold,FontSize=12,Bold=0,PrimaryColour=&H00FFFFFF,BackColour=&H66000000,"
    "BorderStyle=4,Outline=3,Shadow=0,Alignment=2,MarginV=17,WrapStyle=2"
)
TITLE = "SkyBlink — NASA Space Apps 2026"
COMMENT = "Voiceover generated with ElevenLabs (AI). Imagery: real NASA SPHEREx data"
# Where in each scene (seconds from its start) the still for the slides is taken.
STILLS = {"s1": -0.3, "s2": -0.4, "s3": 2.2, "s4": 3.0, "s5": -0.2, "s6": -0.2}


def run(*args: str) -> str:
    return subprocess.run(args, check=True, capture_output=True, text=True).stdout


def duration(path: Path) -> float:
    return float(run("ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(path)))


def sync_point(video: Path) -> float:
    """Time of the first frame after the magenta sync frame (high Cr in the centre of the picture)."""
    out = subprocess.run(
        ["ffmpeg", "-hide_banner", "-v", "error", "-i", str(video), "-vf",
         "crop=200:200:860:440,signalstats,metadata=print:key=lavfi.signalstats.VAVG:file=-", "-f", "null", "-"],
        check=True, capture_output=True, text=True,
    ).stdout.split("\n")
    times, vavg = [], []
    for line in out:
        if "pts_time:" in line:
            times.append(float(line.split("pts_time:")[1].split()[0]))
        elif "VAVG=" in line:
            vavg.append(float(line.split("=")[1]))
    magenta = [i for i, v in enumerate(vavg) if v > 200]
    if not magenta or magenta[-1] + 1 >= len(times):
        raise SystemExit(f"{video.name}: sync frame not found")
    return times[magenta[-1] + 1]


def cut(name: str, start: float, dur: float) -> Path:
    """Exactly `dur` seconds from `start`, at 1920x1080 / 30 fps (the last frame is held if needed)."""
    out = BUILD / f"{name}.mp4"
    vf = (f"trim=start={start:.3f},setpts=PTS-STARTPTS,fps={FPS},scale=1920:1080,"
          f"tpad=stop_mode=clone:stop_duration=1,trim=duration={dur:.3f},setpts=PTS-STARTPTS,format=yuv420p")
    run("ffmpeg", "-y", "-v", "error", "-i", str(SCENE_DIR / f"{name}.webm"), "-vf", vf, "-an",
        "-c:v", "libx264", "-preset", "veryfast", "-crf", "12", str(out))
    return out


def main() -> None:
    BUILD.mkdir(parents=True, exist_ok=True)
    FONTS.mkdir(parents=True, exist_ok=True)
    font = FONTS / "MonaSans-SemiBold.ttf"
    if not font.exists():
        urllib.request.urlretrieve(FONT_URL, font)

    windows = scene_windows()
    marks = json.loads((SCENE_DIR / "marks.json").read_text())
    parts, report = [], {}
    for name, (a, b) in windows.items():
        t0 = sync_point(SCENE_DIR / f"{name}.webm")
        dur = round(b - a, 3)
        avail = duration(SCENE_DIR / f"{name}.webm") - t0
        if avail < dur:
            raise SystemExit(f"{name}: only {avail:.2f} s recorded after the sync point, need {dur:.2f} s")
        parts.append(cut(name, t0, dur))
        report[name] = {"window": [a, b], "sync": t0, "recorded_after_t0": marks[name]["recorded_after_t0"]}
        print(f"{name}: {a:6.2f}-{b:6.2f}  cut from {t0:.2f} s of {name}.webm")

    total = round(list(windows.values())[-1][1], 3)
    joined = BUILD / "scenes.mp4"
    inputs = [x for p in parts for x in ("-i", str(p))]
    run("ffmpeg", "-y", "-v", "error", *inputs, "-filter_complex",
        "".join(f"[{i}:v]" for i in range(len(parts))) + f"concat=n={len(parts)}:v=1:a=0[v]", "-map", "[v]",
        "-c:v", "libx264", "-preset", "veryfast", "-crf", "12", str(joined))

    subs = f"subtitles=filename={OUT / 'captions.srt'}:fontsdir={FONTS}:force_style='{CAPTION_STYLE}'"
    run("ffmpeg", "-y", "-v", "error", "-i", str(joined), "-i", str(OUT / "voice.mp3"),
        "-filter_complex", f"[0:v]{subs},format=yuv420p[v];[1:a]apad[a]", "-map", "[v]", "-map", "[a]",
        "-t", f"{total:.3f}", "-r", str(FPS),
        "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-profile:v", "high",
        "-c:a", "aac", "-b:a", "192k", "-ar", "44100",
        "-metadata", f"title={TITLE}", "-metadata", f"comment={COMMENT}",
        "-movflags", "+faststart", str(FINAL))

    # Stills for the slides, from the joined scenes (no captions burned in).
    stills = OUT / "stills"
    stills.mkdir(exist_ok=True)
    for i, (name, (a, b)) in enumerate(windows.items(), 1):
        off = STILLS[name]
        t = (b + off) if off < 0 else (a + off)
        run("ffmpeg", "-y", "-v", "error", "-ss", f"{t:.3f}", "-i", str(joined), "-frames:v", "1",
            str(stills / f"{i}-{name}.png"))

    d = duration(FINAL)
    print(f"{FINAL}: {d:.3f} s, {FINAL.stat().st_size / 1e6:.2f} MB")
    (BUILD / "report.json").write_text(json.dumps(report | {"total": total, "final_duration": d}, indent=2))
    if d > MAX_SECONDS:
        raise SystemExit(f"FAIL: {d:.2f} s is longer than {MAX_SECONDS} s")


if __name__ == "__main__":
    main()
