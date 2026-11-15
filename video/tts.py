"""Generate the narration with ElevenLabs "Create speech with timing".

POST /v1/text-to-speech/{voice_id}/with-timestamps returns the audio (base64) and character-level
alignment. The API key is read from ELEVENLABS_API_KEY and only ever sent in the request header.

Usage: uv run tts.py   (writes out/voice.mp3 and out/alignment.json)
"""

import base64
import json
import os
import sys
import urllib.error
import urllib.request
from pathlib import Path

from narration import MODEL_ID, SPEED, TEXT, VOICE_ID

OUT = Path(__file__).parent / "out"
URL = f"https://api.elevenlabs.io/v1/text-to-speech/{VOICE_ID}/with-timestamps?output_format=mp3_44100_128"


def main() -> None:
    key = os.environ.get("ELEVENLABS_API_KEY")
    if not key:
        sys.exit("ELEVENLABS_API_KEY is not set")
    body = json.dumps({"text": TEXT, "model_id": MODEL_ID, "voice_settings": {"speed": SPEED}}).encode()
    req = urllib.request.Request(
        URL, data=body, method="POST", headers={"xi-api-key": key, "content-type": "application/json"}
    )
    try:
        with urllib.request.urlopen(req, timeout=120) as r:
            data = json.load(r)
    except urllib.error.HTTPError as e:  # the error body never contains the key
        sys.exit(f"ElevenLabs HTTP {e.code}: {e.read().decode(errors='replace')[:500]}")

    if not data.get("alignment"):
        sys.exit(f"no alignment returned by model {MODEL_ID}")
    OUT.mkdir(exist_ok=True)
    (OUT / "voice.mp3").write_bytes(base64.b64decode(data["audio_base64"]))
    meta = {"model_id": MODEL_ID, "voice_id": VOICE_ID, "speed": SPEED, "text": TEXT}
    (OUT / "alignment.json").write_text(
        json.dumps(meta | {"alignment": data["alignment"], "normalized_alignment": data.get("normalized_alignment")})
    )
    end = data["alignment"]["character_end_times_seconds"][-1]
    print(f"model {MODEL_ID}: last character ends at {end:.2f} s")


if __name__ == "__main__":
    main()
