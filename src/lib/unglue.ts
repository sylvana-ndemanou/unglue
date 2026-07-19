import {spawn} from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import {fileURLToPath} from 'node:url'

// tsup bundles everything into a single dist/cli.js, so this module's own
// path doesn't sit a fixed number of folders under the repo root depending
// on whether we're running from src/ (dev) or dist/ (built) — walk upward
// until we find tools/unglue/unglue.py instead of assuming a fixed depth.
function findRepoRoot(): string {
  let dir = path.dirname(fileURLToPath(import.meta.url))
  for (let i = 0; i < 6; i++) {
    if (fs.existsSync(path.join(dir, 'tools', 'unglue', 'unglue.py'))) return dir
    const parent = path.dirname(dir)
    if (parent === dir) break
    dir = parent
  }
  // fall back to the old assumption if the walk-up somehow fails
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
}

const REPO_ROOT = findRepoRoot()
const UNGLUE_SCRIPT = path.join(REPO_ROOT, 'tools', 'unglue', 'unglue.py')
const UNGLUE_VENV_PYTHON = path.join(REPO_ROOT, 'tools', 'unglue', '.venv', 'bin', 'python3')

export type UnglueResult = {
  vocalsPath: string
  instrumentalPath: string
  videoPath?: string
}

export type UnglueOptions = {
  inputPath: string
  outDir: string
  format?: 'mp3' | 'wav'
  model?: 'htdemucs' | 'htdemucs_ft' | 'mdx_extra'
  remux?: boolean
  /** clip window, e.g. "1:10" — omit either for the start/end of the file */
  start?: string
  end?: string
}

function commandWorks(cmd: string, args: string[]): Promise<boolean> {
  return new Promise(resolve => {
    let child
    try {
      child = spawn(cmd, args, {stdio: 'ignore', timeout: 10_000})
    } catch {
      resolve(false)
      return
    }
    child.on('error', () => resolve(false))
    child.on('close', code => resolve(code === 0))
  })
}

/**
 * Resolve a python interpreter that has demucs installed: the tool's own
 * venv first (created per tools/unglue/README.md), then whatever's on PATH.
 */
export async function ensureUngluePython(): Promise<string> {
  if (await commandWorks(UNGLUE_VENV_PYTHON, ['-c', 'import demucs'])) return UNGLUE_VENV_PYTHON
  if (await commandWorks('python3', ['-c', 'import demucs'])) return 'python3'
  throw new Error(
    'demucs not found. Run the setup in tools/unglue/README.md (creates a venv and installs it) first.',
  )
}

export type UnglueHandlers = {
  onLine: (line: string) => void
}

/**
 * Spawn unglue.py to separate vocals from instrumental. Streams demucs'
 * stdout/stderr lines back via onLine so a caller can show progress —
 * demucs doesn't expose a clean machine-readable progress format, so this
 * is best-effort passthrough rather than a parsed percentage.
 */
export function unglueTrack(
  python: string,
  opts: UnglueOptions,
  handlers: UnglueHandlers,
  signal?: AbortSignal,
): Promise<UnglueResult> {
  const args = [
    UNGLUE_SCRIPT,
    opts.inputPath,
    '-o',
    opts.outDir,
    '-f',
    opts.format ?? 'mp3',
    '-m',
    opts.model ?? 'htdemucs',
  ]
  if (opts.remux) args.push('--remux')
  if (opts.start) args.push('--start', opts.start)
  if (opts.end) args.push('--end', opts.end)

  return new Promise((resolve, reject) => {
    const child = spawn(python, args, {signal})
    let stderr = ''

    const forwardLines = (chunk: Buffer) => {
      for (const line of chunk.toString().split('\n')) {
        const trimmed = line.trim()
        if (trimmed) handlers.onLine(trimmed)
      }
    }
    child.stdout.on('data', forwardLines)
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString()
      forwardLines(chunk)
    })

    child.on('error', reject)
    child.on('close', code => {
      if (code !== 0) {
        reject(new Error(stderr.trim() || `unglue.py exited with code ${code}`))
        return
      }
      const ext = opts.format ?? 'mp3'
      const stem = path.basename(opts.inputPath, path.extname(opts.inputPath))
      // unglue.py appends _clip when a start/end range was requested, even
      // for a plain audio file, to keep clipped output distinguishable
      const suffix = opts.start || opts.end ? '_clip' : ''
      resolve({
        vocalsPath: path.join(opts.outDir, `${stem}${suffix}_vocals.${ext}`),
        instrumentalPath: path.join(opts.outDir, `${stem}${suffix}_instrumental.${ext}`),
        videoPath: opts.remux
          ? path.join(opts.outDir, `${stem}${suffix}_instrumental${path.extname(opts.inputPath)}`)
          : undefined,
      })
    })
  })
}
