"""Build out/captions.srt from the alignment: one sentence per cue, long sentences split at a comma,
at most two lines of about 42 characters."""

import textwrap

from timeline import OUT, Span, sentences, split_at

MAX_LINE = 42
SPLIT_OVER = 64  # sentences longer than this are split at their first comma
HOLD = 0.6  # a cue stays up to this long after its last word, never past the next cue


def cues() -> list[Span]:
    out: list[Span] = []
    for s in sentences():
        out += split_at(s, ", ") if len(s.text) > SPLIT_OVER and ", " in s.text else [s]
    return out


def lines(text: str) -> list[str]:
    wrapped = textwrap.wrap(text, MAX_LINE)
    if len(wrapped) == 2:  # balance the two lines so the lower one is not a stub
        words, best = text.split(), None
        for k in range(1, len(text.split())):
            a, b = " ".join(words[:k]), " ".join(words[k:])
            if len(a) <= MAX_LINE + 2 and len(b) <= MAX_LINE + 2:
                score = abs(len(a) - len(b))
                if best is None or score < best[0]:
                    best = (score, [a, b])
        wrapped = best[1] if best else wrapped
    assert len(wrapped) <= 2, f"cue needs more than 2 lines: {text!r}"
    return wrapped


def ts(t: float) -> str:
    ms = round(t * 1000)
    return f"{ms // 3_600_000:02}:{ms // 60_000 % 60:02}:{ms // 1000 % 60:02},{ms % 1000:03}"


def main() -> None:
    cs = cues()
    blocks = []
    for i, c in enumerate(cs):
        end = c.end + HOLD
        if i + 1 < len(cs):
            end = min(end, cs[i + 1].start - 0.05)
        blocks.append(f"{i + 1}\n{ts(c.start)} --> {ts(end)}\n" + "\n".join(lines(c.text)) + "\n")
        print(f"{i + 1:2}  {c.start:6.2f} -> {end:6.2f}  {' / '.join(lines(c.text))}")
    (OUT / "captions.srt").write_text("\n".join(blocks), encoding="utf-8")


if __name__ == "__main__":
    main()
