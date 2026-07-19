import {spawn} from 'node:child_process'
import path from 'node:path'
import {fileURLToPath} from 'node:url'

// tools/split/split.py, resolved relative to this file so it works whether
// this runs from src/ (ts-node/dev) or dist/ (built) — both sit one level
// under the repo root.
const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const SPLIT_SCRIPT = path.join(REPO_ROOT, 'tools', 'split', 'split.py')
const SPLIT_VENV_PYTHON = path.join(REPO_ROOT, 'tools', 'split', '.venv', 'bin', 'python3')

export type SplitResult = {
  vocalsPath: string
  instrumentalPath: string
  videoPath?: string
}

export type SplitOptions = {
  inputPath: string
  outDir: string
  format?: 'mp3' | 'wav'
  model?: 'htdemucs' | 'htdemucs_ft' | 'mdx_extra'
  remux?: boolean
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
 * venv first (created per tools/split/README.md), then whatever's on PATH.
 */
export async function ensureSplitPython(): Promise<string> {
  if (await commandWorks(SPLIT_VENV_PYTHON, ['-c', 'import demucs'])) return SPLIT_VENV_PYTHON
  if (await commandWorks('python3', ['-c', 'import demucs'])) return 'python3'
  throw new Error(
    'demucs not found. Run the setup in tools/split/README.md (creates a venv and installs it) first.',
  )
}

export type SplitHandlers = {
  onLine: (line: string) => void
}

/**
 * Spawn split.py to separate vocals from instrumental. Streams demucs'
 * stdout/stderr lines back via onLine so a caller can show progress —
 * demucs doesn't expose a clean machine-readable progress format, so this
 * is best-effort passthrough rather than a parsed percentage.
 */
export function splitVocals(
  python: string,
  opts: SplitOptions,
  handlers: SplitHandlers,
  signal?: AbortSignal,
): Promise<SplitResult> {
  const args = [
    SPLIT_SCRIPT,
    opts.inputPath,
    '-o',
    opts.outDir,
    '-f',
    opts.format ?? 'mp3',
    '-m',
    opts.model ?? 'htdemucs',
  ]
  if (opts.remux) args.push('--remux')

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
        reject(new Error(stderr.trim() || `split.py exited with code ${code}`))
        return
      }
      const ext = opts.format ?? 'mp3'
      const stem = path.basename(opts.inputPath, path.extname(opts.inputPath))
      resolve({
        vocalsPath: path.join(opts.outDir, `${stem}_vocals.${ext}`),
        instrumentalPath: path.join(opts.outDir, `${stem}_instrumental.${ext}`),
        videoPath: opts.remux
          ? path.join(opts.outDir, `${stem}_instrumental${path.extname(opts.inputPath)}`)
          : undefined,
      })
    })
  })
}
