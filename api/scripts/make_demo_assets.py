import argparse
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

from skyblink.adapters.result_store import ResultStore
from skyblink.api.schemas import mjd_to_iso
from skyblink.config import Settings
from skyblink.domain.models import Frame, FrameStatus, Job, Target

UPSCALE = 8
FRAME_MS = 1000
CROSSHAIR = (255, 90, 70)
ARROW = (90, 200, 255)
LABEL_BACKGROUND = (0, 0, 0, 170)
FONT_PATHS = ("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",)
COMPARE_HALF = 7
COMPARE_SCALE = 30

TARGETS = {
    "barnard": (Target(269.4462, 4.7682, 6.0), "Barnard's star"),
    "eps_indi_b": (Target(331.0967, -56.8007, 6.0), "eps Ind B"),
    "wise0855": (Target(133.7601, -7.2423, 6.0), None),
}


def font(size: int) -> ImageFont.FreeTypeFont:
    for path in FONT_PATHS:
        if Path(path).exists():
            return ImageFont.truetype(path, size)
    return ImageFont.load_default(size)


def load_job(store: ResultStore, target: Target, name: str | None) -> Job:
    job = store.load((target.ra, target.dec, target.fov_arcmin, ("D6",), 30, name), created_at=0.0)
    if job is None:
        raise SystemExit(f"no saved result for {target} name={name!r} at this pipeline version")
    return job


def ready_frames(job: Job) -> list[Frame]:
    return sorted((f for f in job.frames if f.status == FrameStatus.READY), key=lambda f: f.mid_mjd)


def label(frame: Frame) -> str:
    low, high = frame.wavelength_um
    return f"{mjd_to_iso(frame.mid_mjd)[:10]} · {frame.detector} · {low:.2f}–{high:.2f} µm"


def draw_crosshair(draw: ImageDraw.ImageDraw, centre: tuple[float, float], gap: float, length: float) -> None:
    x, y = centre
    for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
        start = (x + dx * gap, y + dy * gap)
        end = (x + dx * (gap + length), y + dy * (gap + length))
        draw.line([start, end], CROSSHAIR, 2)


def draw_label(image: Image.Image, text: str, size: int = 18, at: tuple[int, int] = (8, 8)) -> Image.Image:
    overlay = Image.new("RGBA", image.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay)
    box = draw.textbbox(at, text, font=font(size))
    draw.rectangle((box[0] - 6, box[1] - 4, box[2] + 6, box[3] + 4), LABEL_BACKGROUND)
    draw.text(at, text, fill=(255, 255, 255, 255), font=font(size))
    return Image.alpha_composite(image.convert("RGBA"), overlay).convert("RGB")


def animation_frame(frame: Frame) -> Image.Image:
    native = Image.open(frame.image_path).convert("L")
    big = native.resize((native.width * UPSCALE, native.height * UPSCALE), Image.Resampling.NEAREST)
    big = big.convert("RGB")
    centre = ((native.width - 1) / 2 + 0.5) * UPSCALE, ((native.height - 1) / 2 + 0.5) * UPSCALE
    draw_crosshair(ImageDraw.Draw(big), centre, gap=2.5 * UPSCALE, length=3 * UPSCALE)
    return draw_label(big, label(frame))


def write_gif(job: Job, path: Path) -> Path:
    first, *rest = [animation_frame(frame) for frame in ready_frames(job)]
    first.save(path, format="GIF", save_all=True, append_images=rest, duration=FRAME_MS, loop=0)
    return path


def to_crop(
    grid_xy: tuple[float, float], size: tuple[int, int], origin: tuple[int, int]
) -> tuple[float, float]:
    x, y = grid_xy
    row = size[1] - 1 - y
    return (x - origin[0] + 0.5) * COMPARE_SCALE, (row - origin[1] + 0.5) * COMPARE_SCALE


def draw_arrow(draw: ImageDraw.ImageDraw, start: tuple[float, float], end: tuple[float, float]) -> None:
    draw.line([start, end], ARROW, 4)
    dx, dy = end[0] - start[0], end[1] - start[1]
    length = max((dx**2 + dy**2) ** 0.5, 1e-6)
    ux, uy = dx / length, dy / length
    head = 16
    left = (end[0] - head * ux + head * 0.5 * uy, end[1] - head * uy - head * 0.5 * ux)
    right = (end[0] - head * ux - head * 0.5 * uy, end[1] - head * uy + head * 0.5 * ux)
    draw.polygon([end, left, right], fill=ARROW)
    radius = 6
    draw.ellipse(
        (start[0] - radius, start[1] - radius, start[0] + radius, start[1] + radius), outline=ARROW, width=3
    )


def crop_panel(frame: Frame) -> tuple[Image.Image, tuple[int, int], tuple[int, int]]:
    native = Image.open(frame.image_path).convert("L")
    centre_col, centre_row = (native.width - 1) // 2, (native.height - 1) // 2
    origin = (centre_col - COMPARE_HALF, centre_row - COMPARE_HALF)
    box = (origin[0], origin[1], centre_col + COMPARE_HALF + 1, centre_row + COMPARE_HALF + 1)
    side = (2 * COMPARE_HALF + 1) * COMPARE_SCALE
    panel = native.crop(box).resize((side, side), Image.Resampling.NEAREST).convert("RGB")
    centre = ((centre_col - origin[0] + 0.5) * COMPARE_SCALE, (centre_row - origin[1] + 0.5) * COMPARE_SCALE)
    draw_crosshair(ImageDraw.Draw(panel), centre, gap=2.5 * COMPARE_SCALE, length=2 * COMPARE_SCALE)
    return panel, native.size, origin


def write_compare(job: Job, path: Path) -> Path:
    motion, frames = job.motion, ready_frames(job)
    if motion is None or motion.prediction is None:
        raise SystemExit("the comparison needs a measured motion with a catalog prediction")
    first, last = frames[0], frames[-1]
    left, size, origin = crop_panel(first)
    right, _, _ = crop_panel(last)
    start = to_crop(motion.seasons[0].position_px, size, origin)
    end = to_crop(motion.seasons[-1].position_px, size, origin)
    draw_arrow(ImageDraw.Draw(right), start, end)
    width, height = left.size
    gutter, footer = 12, 56
    canvas = Image.new("RGB", (2 * width + gutter, height + footer), (12, 12, 16))
    for index, (frame, image) in enumerate(((first, left), (last, right))):
        canvas.paste(draw_label(image, label(frame), size=17), (index * (width + gutter), 0))
    prediction = motion.prediction
    text = (
        f"Measured {motion.rate_arcsec_yr:.2f} ± {motion.rate_err_arcsec_yr:.2f}″/yr · "
        f"Predicted {prediction.predicted_rate_arcsec_yr:.2f}″/yr (Gaia, same epochs)"
    )
    draw = ImageDraw.Draw(canvas)
    box = draw.textbbox((0, 0), text, font=font(20))
    draw.text(
        ((canvas.width - (box[2] - box[0])) / 2, height + 14), text, fill=(235, 235, 235), font=font(20)
    )
    canvas.save(path, format="PNG")
    return path


def main() -> None:
    parser = argparse.ArgumentParser(description="Demo GIFs and comparison image from saved results")
    parser.add_argument("output_dir", type=Path)
    args = parser.parse_args()
    args.output_dir.mkdir(parents=True, exist_ok=True)
    store = ResultStore(Settings.from_env().output_dir / "results")
    jobs = {key: load_job(store, target, name) for key, (target, name) in TARGETS.items()}
    for key, job in jobs.items():
        print(write_gif(job, args.output_dir / f"{key}.gif"))
    print(write_compare(jobs["barnard"], args.output_dir / "barnard_compare.png"))


if __name__ == "__main__":
    main()
