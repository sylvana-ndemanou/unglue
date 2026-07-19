#!/usr/bin/env python3
"""
unglue — pull the vocals off a track, terminal-side.

Wraps Demucs (Meta AI Research, htdemucs model) to split an audio or video
file into a vocals track and an instrumental track. yoinks' companion tool
for stem separation.

Usage:
    python3 unglue.py song.mp3
    python3 unglue.py video.mp4 --remux            # also rebuild a video with the instrumental as its audio track
    python3 unglue.py song.wav --model htdemucs_ft  # slower, slightly cleaner separation
    python3 unglue.py song.mp3 --format wav         # keep lossless output instead of mp3
    python3 unglue.py song.mp3 --start 1:10 --end 1:50   # only unglue that clip

Requires:
    pip install -U demucs
    ffmpeg on PATH (used for video audio extraction/remux, clip trimming, and mp3 encoding)

Source for the flags used below: facebookresearch/demucs README
(https://github.com/facebookresearch/demucs) — --two-stems=vocals for the
vocals/no_vocals split, --mp3/--mp3-bitrate for mp3 output, -n for model choice.
"""
from __future__ import annotations

import argparse
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

VIDEO_EXTENSIONS = {".mp4", ".mov", ".mkv", ".webm", ".avi", ".m4v"}

BANNER = (
    "  █   █ █   █  ███  █     █   █ █████\n"
    "  █   █ ██  █ █     █     █   █ █    \n"
    "  █   █ █ █ █ █  ██ █     █   █ ████ \n"
    "  █   █ █  ██ █   █ █     █   █ █    \n"
    "   ███  █   █  ███  █████  ███  █████\n"
)


def print_banner() -> None:
    print(BANNER)
    print("  unglue any track. peel. done.")
    print("  vocals / instrumental — powered by demucs\n")


def parse_timestamp(value: str) -> float:
    """Parse 'SS', 'MM:SS', or 'HH:MM:SS' into seconds."""
    parts = value.strip().split(":")
    try:
        numbers = [float(p) for p in parts]
    except ValueError as error:
        raise ValueError(f"'{value}' isn't a valid timestamp (use SS, MM:SS, or HH:MM:SS)") from error
    seconds = 0.0
    for n in numbers:
        seconds = seconds * 60 + n
    return seconds


def check_tool(name: str) -> bool:
    return shutil.which(name) is not None


def detect_device() -> str:
    """Pick the fastest backend available: CUDA > Apple MPS > CPU."""
    try:
        import torch

        if torch.cuda.is_available():
            return "cuda"
        if getattr(torch.backends, "mps", None) and torch.backends.mps.is_available():
            return "mps"
    except ImportError:
        pass
    return "cpu"


def extract_audio(source_path: Path, workdir: Path, start: float | None, end: float | None) -> Path:
    """Pull/trim audio into a wav Demucs can ingest. Works for audio or video input.

    Runs through ffmpeg unconditionally when a range is requested (even for
    plain audio files), since that's the simplest way to trim any container.
    """
    audio_path = workdir / f"{source_path.stem}.wav"
    cmd = ["ffmpeg", "-y"]
    if start is not None:
        cmd += ["-ss", str(start)]
    cmd += ["-i", str(source_path)]
    if end is not None:
        duration = end - (start or 0)
        if duration <= 0:
            raise ValueError("--end must come after --start")
        cmd += ["-t", str(duration)]
    cmd += ["-vn", "-acodec", "pcm_s16le", "-ar", "44100", "-ac", "2", str(audio_path)]
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        raise RuntimeError(f"ffmpeg couldn't extract audio:\n{result.stderr.strip()[-500:]}")
    return audio_path


def trim_video(video_path: Path, out_path: Path, start: float | None, end: float | None) -> Path:
    """Cut the video itself to the same window, so a --remux output lines up with the trimmed audio."""
    cmd = ["ffmpeg", "-y"]
    if start is not None:
        cmd += ["-ss", str(start)]
    cmd += ["-i", str(video_path)]
    if end is not None:
        duration = end - (start or 0)
        cmd += ["-t", str(duration)]
    cmd += ["-c", "copy", str(out_path)]
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        raise RuntimeError(f"ffmpeg couldn't trim the video:\n{result.stderr.strip()[-500:]}")
    return out_path


def run_demucs(input_path: Path, out_dir: Path, model: str, fmt: str, device: str) -> Path:
    """Run Demucs with --two-stems=vocals and return the folder holding the two output files."""
    cmd = [
        sys.executable, "-m", "demucs",
        "--two-stems", "vocals",
        "-n", model,
        "-d", device,
        "-o", str(out_dir),
    ]
    if fmt == "mp3":
        cmd += ["--mp3", "--mp3-bitrate", "320"]
    cmd.append(str(input_path))

    print(f"→ running demucs ({model}, device={device})…")
    result = subprocess.run(cmd)
    if result.returncode != 0:
        raise RuntimeError("demucs exited with an error — see output above.")

    # demucs writes to <out_dir>/<model>/<track_stem>/{vocals,no_vocals}.<ext>
    track_dir = out_dir / model / input_path.stem
    if not track_dir.exists():
        raise RuntimeError(f"expected demucs output at {track_dir}, but it wasn't created.")
    return track_dir


def remux_instrumental(video_path: Path, instrumental_path: Path, out_path: Path) -> None:
    """Rebuild a video (already trimmed to match, if a range was requested) with the instrumental track as its audio."""
    cmd = [
        "ffmpeg", "-y",
        "-i", str(video_path),
        "-i", str(instrumental_path),
        "-map", "0:v:0", "-map", "1:a:0",
        "-c:v", "copy", "-c:a", "aac", "-b:a", "192k",
        "-shortest",
        str(out_path),
    ]
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        raise RuntimeError(f"ffmpeg couldn't remux the video:\n{result.stderr.strip()[-500:]}")


def main() -> None:
    print_banner()
    parser = argparse.ArgumentParser(description="Split vocals from instrumental using Demucs.")
    parser.add_argument("input", type=Path, help="audio or video file to process")
    parser.add_argument("-o", "--output", type=Path, default=Path.cwd(), help="output directory (default: cwd)")
    parser.add_argument("-m", "--model", default="htdemucs",
                         help="htdemucs (balanced, default), htdemucs_ft (slower, cleaner), mdx_extra (fast)")
    parser.add_argument("-f", "--format", choices=["mp3", "wav"], default="mp3", help="output audio format")
    parser.add_argument("--remux", action="store_true",
                         help="if the input is a video, also produce a copy of it with the instrumental as audio")
    parser.add_argument("--start", type=str, default=None, help="clip start, e.g. 1:10 (default: beginning)")
    parser.add_argument("--end", type=str, default=None, help="clip end, e.g. 1:50 (default: end of file)")
    parser.add_argument("--device", choices=["auto", "cpu", "cuda", "mps"], default="auto")
    args = parser.parse_args()

    if not args.input.exists():
        sys.exit(f"error: {args.input} not found")
    if not check_tool("ffmpeg"):
        sys.exit("error: ffmpeg not found on PATH — install it first (e.g. `brew install ffmpeg`)")

    try:
        import demucs  # noqa: F401
    except ImportError:
        sys.exit("error: demucs not installed — run `pip install -U demucs` first")

    start = parse_timestamp(args.start) if args.start else None
    end = parse_timestamp(args.end) if args.end else None
    if start is not None and end is not None and end <= start:
        sys.exit("error: --end must come after --start")

    device = detect_device() if args.device == "auto" else args.device
    args.output.mkdir(parents=True, exist_ok=True)

    is_video = args.input.suffix.lower() in VIDEO_EXTENSIONS
    clipped = start is not None or end is not None
    suffix = "_clip" if clipped else ""

    with tempfile.TemporaryDirectory() as tmp:
        tmp_dir = Path(tmp)
        # trim/extract unconditionally when a range is given, even for a
        # plain audio file — otherwise pass audio straight through untouched
        audio_input = (
            extract_audio(args.input, tmp_dir, start, end) if (is_video or clipped) else args.input
        )

        track_dir = run_demucs(audio_input, tmp_dir / "demucs_out", args.model, args.format, device)
        ext = "mp3" if args.format == "mp3" else "wav"

        vocals_src = track_dir / f"vocals.{ext}"
        instrumental_src = track_dir / f"no_vocals.{ext}"

        vocals_dst = args.output / f"{args.input.stem}{suffix}_vocals.{ext}"
        instrumental_dst = args.output / f"{args.input.stem}{suffix}_instrumental.{ext}"
        shutil.copy(vocals_src, vocals_dst)
        shutil.copy(instrumental_src, instrumental_dst)

        print(f"✓ vocals:       {vocals_dst}")
        print(f"✓ instrumental: {instrumental_dst}")

        if is_video and args.remux:
            video_out = args.output / f"{args.input.stem}{suffix}_instrumental{args.input.suffix}"
            source_video = args.input
            if clipped:
                # cut the video to the same window so it lines up with the trimmed audio
                source_video = trim_video(args.input, tmp_dir / f"video_clip{args.input.suffix}", start, end)
            remux_instrumental(source_video, instrumental_dst, video_out)
            print(f"✓ video (instrumental audio): {video_out}")


if __name__ == "__main__":
    main()
