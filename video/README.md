# Demo video

Builds the 30-second submission video (`out/skyblink-demo.mp4`) from the live site and real SPHEREx data.
Fish shell; requires [uv](https://docs.astral.sh/uv/), ffmpeg with libass, and Google Chrome.

```fish
cd video
uv sync
uv run tts.py        # narration (ElevenLabs, needs ELEVENLABS_API_KEY) -> out/voice.mp3, out/alignment.json
uv run captions.py   # -> out/captions.srt, one cue per sentence, timed by the alignment
uv run record.py     # six scenes with Playwright recordVideo, 1920x1080 -> out/scenes/
uv run assemble.py   # cut, join, voice, captions, metadata, checks -> out/skyblink-demo.mp4, out/stills/
```

- `narration.py` holds the text, voice and model; `timeline.py` turns the alignment into the scene windows, so a
  new narration re-times everything.
- `scenes/title.html` and `scenes/end.html` are the text-only title and end cards.
- Each scene starts with a magenta frame; `assemble.py` cuts at the first frame after it, so the timing comes from
  the recording itself.
- The voiceover is AI-generated (ElevenLabs); the end card and the file metadata say so.
