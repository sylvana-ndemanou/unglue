# yoinks split — vocal / instrumental separation

Standalone companion tool for yoinks. Splits an audio or video file into a
vocals track and an instrumental track using [Demucs](https://github.com/facebookresearch/demucs)
(Meta AI Research, htdemucs model — currently the strongest open-source
separation model, ahead of the older Spleeter on quality benchmarks).

This lives outside the Node/TS codebase for now because Demucs is Python/PyTorch —
it's meant to work standalone today, and get wired into the yoinks picker later
(see "Next step" below).

## Setup

```bash
cd tools/split
python3 -m venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\activate
pip install -r requirements.txt  # first install downloads torch — 1-2GB+, be patient
```

You also need `ffmpeg` on your PATH (yoinks already needs this for video merging,
so if yoinks works, you already have it).

## Usage

```bash
# audio in, mp3 vocals + mp3 instrumental out
python3 split.py song.mp3

# video in — extracts audio, splits it, AND rebuilds the video with the
# instrumental as its soundtrack
python3 split.py clip.mp4 --remux

# keep lossless wav instead of mp3
python3 split.py song.mp3 --format wav

# slower but cleaner model (skip for quick jobs)
python3 split.py song.mp3 --model htdemucs_ft

# force CPU if auto-detection picks the wrong device
python3 split.py song.mp3 --device cpu
```

Output goes to `-o/--output` (default: current directory) as:
- `<name>_vocals.mp3`
- `<name>_instrumental.mp3`
- `<name>_instrumental.mp4` (only with `--remux` on a video input)

## Performance notes

- **CPU only**: works, but 5-10x slower than GPU — expect a few minutes per
  song on a laptop CPU.
- **Apple Silicon (M-series)**: auto-detected via PyTorch's MPS backend,
  meaningfully faster than CPU. No setup needed beyond the pip install.
- **htdemucs vs htdemucs_ft**: `htdemucs_ft` (fine-tuned) is the cleanest but
  slower; default `htdemucs` is the right balance for most use cases.

## Next step: wiring into yoinks

The plan (per your "les deux à terme") is to make this a picker option in
yoinks itself — after downloading an audio-only or video file, offer "split
vocals/instrumental?" before yoinks exits. `src/lib/split.ts` in this repo is
a first pass at the Node-side wrapper that would call this script as a
subprocess; it isn't wired into `app.tsx`'s interactive picker yet. That's a
UI task (new picker step + progress display) — happy to do it once the
standalone tool is confirmed working on your machine.
