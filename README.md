# unglue

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="assets/logo-dark.svg">
  <img src="assets/logo-light.svg" alt="unglue" width="288">
</picture>

unglue any track. peel. done.

Pull the vocals off a song or video, right from your terminal — local,
no upload, no cloud processing. Powered by
[Demucs](https://github.com/facebookresearch/demucs) (Meta AI Research),
currently the strongest open-source separation model available. Works on a
full track or just a clip (`1:10-1:50`), on audio or video files.

Built on top of [`yoinks`](https://github.com/pablostanley/yoinks) — the
terminal video downloader this repo started as a fork of — so you can go
from a YouTube link straight to isolated vocals in one session.

## Install

```sh
cd tools/unglue
python3 -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt   # first install pulls PyTorch, ~1-2GB
```

You also need `ffmpeg` on your PATH (used for extraction, clip trimming, and
mp3 encoding).

## Usage

```sh
python3 unglue.py song.mp3                    # → song_vocals.mp3 + song_instrumental.mp3
python3 unglue.py clip.mp4 --remux             # → same, plus clip_instrumental.mp4
python3 unglue.py song.mp3 --start 1:10 --end 1:50   # only that window
python3 unglue.py song.mp3 --model htdemucs_ft # slower, slightly cleaner separation
```

See [`tools/unglue/README.md`](tools/unglue/README.md) for the full flag
reference and performance notes (Apple Silicon MPS, CUDA, model choices).

## Downloading with yoinks first

To grab a track from YouTube, X, Instagram, and 1,800+ other sites before
unglueing it:

```sh
npm install -g yoinks
yoinks https://youtu.be/dQw4w9WgXcQ
```

`yoinks` runs as a full-screen terminal picker — paste a link, choose a
resolution or audio-only mp3, and once the download finishes, press `u` to
unglue it right there in the same session (the picker screen swaps to the
unglue wordmark and walks you through an optional clip range before
separating).

<img src="assets/download-options.png" alt="yoinks format picker — resolutions with estimated file sizes, plus audio-only mp3" width="100%">

See the full [yoinks usage and options](https://github.com/pablostanley/yoinks#readme)
upstream, or `src/app.tsx` in this repo for the unglue-specific picker steps.

## Development

```sh
npm install
npm run build        # bundle to dist/ with tsup
npm run dev          # rebuild on change
node dist/cli.js <url>
npm run typecheck
```

To try it as a global command without publishing: `npm link`, then run
`yoinks` anywhere.

## Roadmap

- [x] Vocal/instrumental separation via Demucs (`tools/unglue`)
- [x] Wire unglue into the yoinks picker as a post-download option
- [x] Clip range support (`--start`/`--end`)
- [ ] `--best` / `--mp3` flags to skip the picker (scriptable mode)
- [ ] `-o <dir>` to choose the output folder
- [ ] Playlist / thread-with-multiple-videos support
- [ ] Clipboard detection: launch bare and auto-suggest the url you copied
- [ ] Self-update for the bundled yt-dlp binary (`yt-dlp -U`)

## A note on fair use

unglue and yoinks are personal-archiving tools. Downloading or remixing
content may violate a platform's terms of service or infringe copyright
depending on what you do with the result — only process what you have the
right to, and be excellent to creators.

## License

[MIT](LICENSE) — this repo started as a fork of
[yoinks](https://github.com/pablostanley/yoinks) by Pablo Stanley; the
original copyright notice is preserved in `LICENSE` as required by the MIT
license.
