"""Sentence timings from the ElevenLabs alignment, and the scene windows built on them.

Every other step reads its timing from here, so a new voice.mp3 re-times the whole video.
"""

import json
import re
from dataclasses import dataclass
from pathlib import Path

OUT = Path(__file__).parent / "out"
LEAD = 0.15  # each scene starts this much before its first sentence, so the picture leads the voice
TAIL = 0.7  # the end card stays this long after the last word


@dataclass
class Span:
    text: str
    start: float
    end: float


def sentences() -> list[Span]:
    a = json.loads((OUT / "alignment.json").read_text())["alignment"]
    chars, starts, ends = a["characters"], a["character_start_times_seconds"], a["character_end_times_seconds"]
    text = "".join(chars)
    spans = []
    # A sentence ends at ". " or at the end of the text; "1930," and "SPHEREx" never contain a period.
    for m in re.finditer(r"\S.*?(?:\.(?=\s|$)|$)", text):
        i, j = m.start(), m.end() - 1
        spans.append(Span(text[i : j + 1], starts[i], ends[j]))
    return spans


def split_at(span: Span, sep: str) -> list[Span]:
    """Split a sentence at its first `sep` (e.g. ", "), keeping the separator on the first part."""
    a = json.loads((OUT / "alignment.json").read_text())["alignment"]
    text = "".join(a["characters"])
    base = text.index(span.text)
    k = span.text.index(sep) + len(sep.rstrip())
    rest = span.text[k:].lstrip()
    r0 = base + span.text.index(rest, k)
    left = Span(span.text[:k], span.start, a["character_end_times_seconds"][base + k - 1])
    right = Span(rest, a["character_start_times_seconds"][r0], span.end)
    return [left, right]


# Scene -> indexes of the sentences it covers.
SCENES = {"s1": [0], "s2": [1], "s3": [2], "s4": [3, 4], "s5": [5], "s6": [6]}


def scene_windows() -> dict[str, tuple[float, float]]:
    """(start, end) of each scene in the final video; they tile [0, last word + TAIL] with no gaps."""
    s = sentences()
    names = list(SCENES)
    starts = [0.0] + [max(0.0, s[SCENES[n][0]].start - LEAD) for n in names[1:]]
    ends = starts[1:] + [s[-1].end + TAIL]
    return {n: (round(a, 3), round(b, 3)) for n, a, b in zip(names, starts, ends)}


if __name__ == "__main__":
    for sp in sentences():
        print(f"{sp.start:6.2f}-{sp.end:6.2f}  {sp.text}")
    for n, (a, b) in scene_windows().items():
        print(f"{n}: {a:6.2f}-{b:6.2f} ({b - a:.2f} s)")
