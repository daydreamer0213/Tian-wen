import { createHash, randomUUID } from 'node:crypto'
import { execFile } from 'node:child_process'
import {
  mkdirSync,
  readFileSync,
  realpathSync,
  lstatSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import {
  basename,
  dirname,
  isAbsolute,
  join,
  relative,
  resolve,
} from 'node:path'

import {
  EvalProtocolError,
  parseEvalReceipt,
  parseEvalRequest,
} from './protocol.js'
import type {
  EvalReceiptV1,
  EvalRequestV1,
  Sha256Digest,
} from './protocol.js'

export {
  EvalProtocolError,
  parseEvalReceipt,
  parseEvalRequest,
}
export type {
  EvalReceiptV1,
  EvalRequestV1,
  Sha256Digest,
}

export const A1_TASK_BUNDLE_DIGEST =
  'sha256:15e08373a535c14bb0de636724170afb05cbb2e8ace1f91ca53bc877f73184d0' as const
export const A1_MODEL_INPUT_DIGEST =
  'sha256:b8f76aae549aeca56d9a4749aa188788648fc0fae578f422c85cfb6da28eb490' as const

const WINDOWS_PROBE_ROOT = 'D:\\DevData\\tianwen-dsh-probe'
const EMPTY_DIGEST =
  'sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855' as const

export interface PythonA1EvaluatorOptions {
  readonly repoRoot: string
  readonly stateRoot: string
  readonly pythonExecutable?: string
}

function isWithin(root: string, candidate: string): boolean {
  const child = relative(root, candidate)
  return child === '' || (!child.startsWith('..') && !isAbsolute(child))
}

function samePath(left: string, right: string): boolean {
  return process.platform === 'win32'
    ? left.toLowerCase() === right.toLowerCase()
    : left === right
}

function windowsProbeRoot(): string {
  const expected = resolve(WINDOWS_PROBE_ROOT)
  if (lstatSync(expected).isSymbolicLink()) {
    throw new Error(`${WINDOWS_PROBE_ROOT} must not be a reparse point`)
  }
  const actual = realpathSync(expected)
  if (!samePath(actual, expected)) {
    throw new Error(`${WINDOWS_PROBE_ROOT} must resolve to itself`)
  }
  return actual
}

function requireFile(path: string, label: string): string {
  let resolved: string
  try {
    resolved = realpathSync(path)
  } catch {
    throw new Error(`${label} is unavailable: ${path}`)
  }
  if (!statSync(resolved).isFile()) {
    throw new Error(`${label} is not a file: ${resolved}`)
  }
  return resolved
}

function prepareStateRoot(path: string): string {
  const lexical = resolve(path)
  const authority =
    process.platform === 'win32' ? windowsProbeRoot() : undefined
  if (
    authority !== undefined &&
    !isWithin(authority, lexical)
  ) {
    throw new Error(`stateRoot must remain below ${WINDOWS_PROBE_ROOT}`)
  }
  mkdirSync(lexical, { recursive: true })
  const actual = realpathSync(lexical)
  if (authority !== undefined) {
    if (!isWithin(authority, actual)) {
      throw new Error(`stateRoot resolves outside ${WINDOWS_PROBE_ROOT}`)
    }
  }
  return actual
}

function prepareStateDirectory(stateRoot: string, name: string): string {
  const lexical = join(stateRoot, name)
  mkdirSync(lexical, { recursive: true })
  const actual = realpathSync(lexical)
  if (!isWithin(stateRoot, actual)) {
    throw new Error(`${name} resolves outside stateRoot`)
  }
  return actual
}

function controlledPython(
  path: string,
  defaultPython: string,
): string {
  const executable = requireFile(path, 'pythonExecutable')
  if (process.platform !== 'win32') {
    return executable
  }
  const hasPythonShape =
    basename(executable).toLowerCase() === 'python.exe' &&
    basename(dirname(executable)).toLowerCase() === 'scripts'
  const isRepositoryDefault = samePath(executable, resolve(defaultPython))
  const isProbePython = isWithin(
    windowsProbeRoot(),
    executable,
  )
  if (!hasPythonShape || (!isRepositoryDefault && !isProbePython)) {
    throw new Error(
      'pythonExecutable must be a controlled Scripts\\python.exe',
    )
  }
  return executable
}

function minimalEnvironment(tempRoot: string): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {
    TEMP: tempRoot,
    TMP: tempRoot,
    UV_OFFLINE: '1',
  }
  for (const name of ['SYSTEMROOT', 'WINDIR', 'COMSPEC', 'PATH', 'PATHEXT']) {
    const value = process.env[name]
    if (value !== undefined) {
      env[name] = value
    }
  }
  return env
}

function runWorker(
  executable: string,
  argv: readonly string[],
  cwd: string,
  env: NodeJS.ProcessEnv,
): Promise<void> {
  return new Promise((resolvePromise, reject) => {
    execFile(
      executable,
      [...argv],
      {
        cwd,
        encoding: 'utf8',
        env,
        maxBuffer: 1024 * 1024,
        shell: false,
        timeout: 45_000,
        windowsHide: false,
      },
      (error, _stdout, stderr) => {
        if (error !== null) {
          const detail = stderr.trim()
          reject(
            new Error(
              detail.length > 0
                ? `Python A1 evaluator failed: ${detail}`
                : `Python A1 evaluator failed: ${error.message}`,
            ),
          )
          return
        }
        resolvePromise()
      },
    )
  })
}

function canonicalResult(value: unknown, serialized: string): void {
  if (
    !serialized.endsWith('\n') ||
    serialized.includes('\r') ||
    `${JSON.stringify(value)}\n` !== serialized
  ) {
    throw new EvalProtocolError(
      'EvalReceiptV1 file must be canonical UTF-8 JSON with one LF',
    )
  }
}

export class PythonA1Evaluator {
  readonly #repoRoot: string
  readonly #stateRoot: string
  readonly #pythonExecutable: string
  readonly #workerScript: string
  readonly #oraclePatch: string
  readonly #evaluationsRoot: string

  constructor(options: PythonA1EvaluatorOptions) {
    this.#repoRoot = realpathSync(options.repoRoot)
    if (!samePath(this.#repoRoot, realpathSync(process.cwd()))) {
      throw new Error('repoRoot must be the current Tianwen worktree')
    }
    this.#stateRoot = prepareStateRoot(options.stateRoot)
    this.#evaluationsRoot = prepareStateDirectory(
      this.#stateRoot,
      'evaluations',
    )
    prepareStateDirectory(this.#stateRoot, 'workspaces')
    const defaultPython = join(
      this.#repoRoot,
      '.venv',
      'Scripts',
      'python.exe',
    )
    const configuredPython = options.pythonExecutable ?? defaultPython
    if (!isAbsolute(configuredPython)) {
      throw new Error('pythonExecutable must be an absolute path')
    }
    try {
      this.#pythonExecutable = controlledPython(
        configuredPython,
        defaultPython,
      )
    } catch (error) {
      if (options.pythonExecutable === undefined) {
        throw new Error(
          `frozen Python baseline is unavailable at ${defaultPython}; ` +
            'create an isolated D:\\DevData venv and pass pythonExecutable',
          { cause: error },
        )
      }
      throw error
    }
    this.#workerScript = requireFile(
      join(this.#repoRoot, 'scripts', 'dsh_probe_alpha_a1_evaluator.py'),
      'A1 evaluator worker',
    )
    this.#oraclePatch = requireFile(
      join(
        this.#repoRoot,
        'alpha',
        'tasks',
        'A1',
        'reference',
        'solution.patch',
      ),
      'A1 oracle patch',
    )
  }

  async evaluateA1(
    candidateKind: 'nop' | 'oracle',
  ): Promise<EvalReceiptV1> {
    if (candidateKind !== 'nop' && candidateKind !== 'oracle') {
      throw new EvalProtocolError('candidateKind must be nop or oracle')
    }
    const requestId = randomUUID()
    const auditRoot = join(this.#evaluationsRoot, requestId)
    const tempRoot = join(auditRoot, 'temp')
    mkdirSync(auditRoot)
    mkdirSync(tempRoot)
    const requestPath = join(auditRoot, 'request.json')
    const resultPath = join(auditRoot, 'result.json')
    const request: EvalRequestV1 = parseEvalRequest({
      schema_version: 'tianwen.eval_request.v1',
      request_id: requestId,
      task_id: 'A1',
      candidate_kind: candidateKind,
      expected_task_bundle_digest: A1_TASK_BUNDLE_DIGEST,
      expected_model_input_digest: A1_MODEL_INPUT_DIGEST,
    })
    writeFileSync(requestPath, `${JSON.stringify(request)}\n`, 'utf8')
    const expectedCandidateDigest: Sha256Digest =
      candidateKind === 'nop'
        ? EMPTY_DIGEST
        : (`sha256:${createHash('sha256')
            .update(readFileSync(this.#oraclePatch))
            .digest('hex')}` as Sha256Digest)

    await runWorker(
      this.#pythonExecutable,
      [
        this.#workerScript,
        '--repo-root',
        this.#repoRoot,
        '--state-root',
        this.#stateRoot,
        '--request',
        requestPath,
        '--result',
        resultPath,
      ],
      this.#repoRoot,
      minimalEnvironment(tempRoot),
    )

    let serialized: string
    let value: unknown
    try {
      serialized = readFileSync(resultPath, 'utf8')
      value = JSON.parse(serialized)
    } catch (error) {
      throw new EvalProtocolError(
        `Python A1 evaluator did not write valid result JSON: ${String(error)}`,
      )
    }
    canonicalResult(value, serialized)
    return parseEvalReceipt(value, request, expectedCandidateDigest)
  }
}
