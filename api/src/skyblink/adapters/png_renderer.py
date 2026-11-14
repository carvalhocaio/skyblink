from pathlib import Path

import numpy as np
from PIL import Image

from skyblink.domain.stretch import StretchParams


def to_picture(image: np.ndarray, stretch: StretchParams, upscale: int = 1) -> Image.Image:
    picture = Image.fromarray(np.flipud(stretch.apply(image)), mode="L")
    if upscale > 1:
        picture = picture.resize(
            (picture.width * upscale, picture.height * upscale), Image.Resampling.NEAREST
        )
    return picture


def render_png(image: np.ndarray, stretch: StretchParams, path: Path, upscale: int = 1) -> Path:
    path.parent.mkdir(parents=True, exist_ok=True)
    to_picture(image, stretch, upscale).save(path, format="PNG", optimize=True)
    return path


def render_animation(
    images: list[np.ndarray],
    stretch: StretchParams,
    path: Path,
    upscale: int = 1,
    frame_ms: int = 600,
) -> Path:
    first, *rest = [to_picture(image, stretch, upscale) for image in images]
    path.parent.mkdir(parents=True, exist_ok=True)
    first.save(path, format="GIF", save_all=True, append_images=rest, duration=frame_ms, loop=0)
    return path
