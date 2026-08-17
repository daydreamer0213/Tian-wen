import { createHash, randomUUID } from 'node:crypto'
import {
  mkdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
} from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

import {
  A1_MODEL_INPUT_DIGEST,
  A1_TASK_BUNDLE_DIGEST,
  EvalProtocolError,
  PythonA1Evaluator,
  parseEvalReceipt,
  parseEvalRequest,
} from '../../packages/tianwen-evaluator-python/src/index.js'
import type {
  EvalReceiptV1,
  EvalRequestV1,
} from '../../packages/tianwen-evaluator-python/src/index.js'

const REPO_ROOT = resolve(import.meta.dirname, '..', '..')
const REQUEST_ID = '7bd89e4f-7f41-44b9-8cd6-3654e12bc20b'
const OTHER_REQUEST_ID = '73c3821d-f85a-4992-bb8b-52d516f70a76'
const EMPTY_DIGEST =
  'sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'
const ORACLE_DIGEST =
  'sha256:1111111111111111111111111111111111111111111111111111111111111111'
const RAW_STDOUT =
  '{"failed_checks":[],"failure_categories":[],"passed_checks":["escaped_quote","escaped_quote_interior_whitespace","malformed_quote","ordinary_fields","quoted_field_whitespace","quoted_final_field_whitespace","quoted_separator"],"summary":"7/7 checks passed","verdict":"met"}\n'
const RAW_STDOUT_DIGEST =
  'sha256:41cc799ba4f5a911608f28bc82a336ad95aed4196f9a14674d550cb6a76473ca'

const REQUEST: EvalRequestV1 = {
  schema_version: 'tianwen.eval_request.v1',
  request_id: REQUEST_ID,
  task_id: 'A1',
  candidate_kind: 'oracle',
  expected_task_bundle_digest: A1_TASK_BUNDLE_DIGEST,
  expected_model_input_digest: A1_MODEL_INPUT_DIGEST,
}

const RECEIPT: EvalReceiptV1 = {
  schema_version: 'tianwen.eval_receipt.v1',
  request_id: REQUEST_ID,
  task_id: 'A1',
  candidate_kind: 'oracle',
  candidate_digest: ORACLE_DIGEST,
  task_bundle_digest: A1_TASK_BUNDLE_DIGEST,
  model_input_digest: A1_MODEL_INPUT_DIGEST,
  verdict: 'met',
  raw_stdout: RAW_STDOUT,
  raw_stdout_digest: RAW_STDOUT_DIGEST,
}

describe('A1 evaluator protocol', () => {
  it('accepts an exact request and receipt association', () => {
    expect(parseEvalRequest(REQUEST)).toEqual(REQUEST)
    expect(parseEvalReceipt(RECEIPT, REQUEST, ORACLE_DIGEST)).toEqual(RECEIPT)
  })

  it('rejects the wrong request schema version', () => {
    expect(() =>
      parseEvalRequest({ ...REQUEST, schema_version: 'tianwen.eval_request.v2' }),
    ).toThrow(EvalProtocolError)
  })

  it('rejects a request for a task other than A1', () => {
    expect(() => parseEvalRequest({ ...REQUEST, task_id: 'A2' })).toThrow(
      EvalProtocolError,
    )
  })

  it('rejects request fields that could smuggle a command or path', () => {
    expect(() =>
      parseEvalRequest({
        ...REQUEST,
        verifier: 'C:\\untrusted\\verify.py',
      }),
    ).toThrow(EvalProtocolError)
  })

  it('rejects a digest without an exact sha256 prefix and payload', () => {
    expect(() =>
      parseEvalRequest({
        ...REQUEST,
        expected_task_bundle_digest: A1_TASK_BUNDLE_DIGEST.slice(7),
      }),
    ).toThrow(EvalProtocolError)
  })

  it('rejects the wrong receipt schema version', () => {
    expect(() =>
      parseEvalReceipt(
        { ...RECEIPT, schema_version: 'tianwen.eval_receipt.v2' },
        REQUEST,
        ORACLE_DIGEST,
      ),
    ).toThrow(EvalProtocolError)
  })

  it('rejects a receipt bound to a different request', () => {
    expect(() =>
      parseEvalReceipt(
        { ...RECEIPT, request_id: OTHER_REQUEST_ID },
        REQUEST,
        ORACLE_DIGEST,
      ),
    ).toThrow(EvalProtocolError)
  })

  it('rejects a receipt bound to a different task or candidate', () => {
    expect(() =>
      parseEvalReceipt(
        { ...RECEIPT, task_id: 'A2', candidate_kind: 'nop' },
        REQUEST,
        ORACLE_DIGEST,
      ),
    ).toThrow(EvalProtocolError)
  })

  it('rejects a receipt bound to a different task or model digest', () => {
    expect(() =>
      parseEvalReceipt(
        {
          ...RECEIPT,
          task_bundle_digest:
            'sha256:2222222222222222222222222222222222222222222222222222222222222222',
          model_input_digest:
            'sha256:3333333333333333333333333333333333333333333333333333333333333333',
        },
        REQUEST,
        ORACLE_DIGEST,
      ),
    ).toThrow(EvalProtocolError)
  })

  it('rejects a receipt that lies about the candidate digest', () => {
    expect(() =>
      parseEvalReceipt(RECEIPT, REQUEST, EMPTY_DIGEST),
    ).toThrow(EvalProtocolError)
  })

  it('rejects a receipt that lies about raw stdout', () => {
    expect(() =>
      parseEvalReceipt(
        { ...RECEIPT, raw_stdout: RAW_STDOUT.replace('7/7', '6/7') },
        REQUEST,
        ORACLE_DIGEST,
      ),
    ).toThrow(EvalProtocolError)
  })

  it('rejects a met receipt when raw stdout reports failure', () => {
    const rawStdout =
      '{"failed_checks":["quoted_separator"],"failure_categories":["behavior_mismatch"],"passed_checks":[],"summary":"0/7 checks passed","verdict":"not_met"}\n'
    const rawStdoutDigest = `sha256:${createHash('sha256').update(rawStdout).digest('hex')}`

    expect(() =>
      parseEvalReceipt(
        { ...RECEIPT, raw_stdout: rawStdout, raw_stdout_digest: rawStdoutDigest },
        REQUEST,
        ORACLE_DIGEST,
      ),
    ).toThrow(EvalProtocolError)
  })

  it('rejects a met receipt with seven invented check names', () => {
    const rawStdout = RAW_STDOUT.replace(
      '"escaped_quote"',
      '"invented_check"',
    )
    const rawStdoutDigest = `sha256:${createHash('sha256').update(rawStdout).digest('hex')}`

    expect(() =>
      parseEvalReceipt(
        { ...RECEIPT, raw_stdout: rawStdout, raw_stdout_digest: rawStdoutDigest },
        REQUEST,
        ORACLE_DIGEST,
      ),
    ).toThrow(EvalProtocolError)
  })

  it('rejects a met receipt with a failure category', () => {
    const rawStdout = RAW_STDOUT.replace(
      '"failure_categories":[]',
      '"failure_categories":["verifier_infrastructure"]',
    )
    const rawStdoutDigest = `sha256:${createHash('sha256').update(rawStdout).digest('hex')}`

    expect(() =>
      parseEvalReceipt(
        { ...RECEIPT, raw_stdout: rawStdout, raw_stdout_digest: rawStdoutDigest },
        REQUEST,
        ORACLE_DIGEST,
      ),
    ).toThrow(EvalProtocolError)
  })
})

describe('PythonA1Evaluator', () => {
  it('rejects a non-Python executable outside the controlled probe environment', () => {
    const probeRoot = process.env.TIANWEN_DSH_PROBE_ROOT
    if (probeRoot === undefined) {
      throw new Error('TIANWEN_DSH_PROBE_ROOT is required')
    }
    expect(
      () =>
        new PythonA1Evaluator({
          repoRoot: REPO_ROOT,
          stateRoot: resolve(probeRoot, 'task-6-constructor-boundary'),
          pythonExecutable: process.execPath,
        }),
    ).toThrow(/pythonExecutable.*controlled/)
  })

  it('rejects a repoRoot other than the current Tianwen worktree', () => {
    const probeRoot = process.env.TIANWEN_DSH_PROBE_ROOT
    if (probeRoot === undefined) {
      throw new Error('TIANWEN_DSH_PROBE_ROOT is required')
    }
    expect(
      () =>
        new PythonA1Evaluator({
          repoRoot: resolve(REPO_ROOT, 'alpha'),
          stateRoot: resolve(probeRoot, 'task-6-constructor-boundary'),
          pythonExecutable:
            process.env.TIANWEN_DSH_PROBE_PYTHON ??
            resolve(probeRoot, 'venv-task-6', 'Scripts', 'python.exe'),
        }),
    ).toThrow(/current Tianwen worktree/)
  })

  it('rejects a state audit junction that resolves outside the D drive authority', () => {
    if (process.platform !== 'win32') {
      return
    }
    const probeRoot = process.env.TIANWEN_DSH_PROBE_ROOT
    if (probeRoot === undefined) {
      throw new Error('TIANWEN_DSH_PROBE_ROOT is required')
    }
    const stateRoot = resolve(
      probeRoot,
      `task-6-path-boundary-${randomUUID()}`,
    )
    mkdirSync(stateRoot, { recursive: true })
    symlinkSync('D:\\DevData', resolve(stateRoot, 'evaluations'), 'junction')
    try {
      expect(
        () =>
          new PythonA1Evaluator({
            repoRoot: REPO_ROOT,
            stateRoot,
            pythonExecutable:
              process.env.TIANWEN_DSH_PROBE_PYTHON ??
              resolve(probeRoot, 'venv-task-6', 'Scripts', 'python.exe'),
          }),
      ).toThrow(/evaluations.*outside/)
    } finally {
      rmSync(stateRoot, { force: true, recursive: true })
    }
  })

  it(
    'reuses the frozen A1 evaluator for repeatable nop and oracle receipts',
    async () => {
      const probeRoot = process.env.TIANWEN_DSH_PROBE_ROOT
      if (probeRoot === undefined) {
        throw new Error('TIANWEN_DSH_PROBE_ROOT is required')
      }
      const pythonExecutable =
        process.env.TIANWEN_DSH_PROBE_PYTHON ??
        resolve(probeRoot, 'venv-task-6', 'Scripts', 'python.exe')
      const evaluator = new PythonA1Evaluator({
        repoRoot: REPO_ROOT,
        stateRoot: resolve(probeRoot, 'task-6-evaluator'),
        pythonExecutable,
      })

      const nop1 = await evaluator.evaluateA1('nop')
      const nop2 = await evaluator.evaluateA1('nop')
      const oracle1 = await evaluator.evaluateA1('oracle')
      const oracle2 = await evaluator.evaluateA1('oracle')

      expect(nop1.verdict).toBe('not_met')
      expect(nop1.raw_stdout).toBe(nop2.raw_stdout)
      expect(nop1.raw_stdout_digest).toBe(nop2.raw_stdout_digest)
      expect(nop1.candidate_digest).toBe(EMPTY_DIGEST)

      expect(oracle1.verdict).toBe('met')
      expect(oracle1.raw_stdout).toBe(oracle2.raw_stdout)
      expect(oracle1.raw_stdout_digest).toBe(oracle2.raw_stdout_digest)
      const oracleOutput = JSON.parse(oracle1.raw_stdout) as {
        passed_checks: unknown[]
        summary: string
      }
      expect(oracleOutput.summary).toBe('7/7 checks passed')
      expect(oracleOutput.passed_checks).toHaveLength(7)
      expect(oracle1.raw_stdout.endsWith(
        process.platform === 'win32' ? '\r\n' : '\n',
      )).toBe(true)

      const patch = readFileSync(
        resolve(REPO_ROOT, 'alpha', 'tasks', 'A1', 'reference', 'solution.patch'),
      )
      expect(oracle1.candidate_digest).toBe(
        `sha256:${createHash('sha256').update(patch).digest('hex')}`,
      )
      expect(nop1.task_bundle_digest).toBe(A1_TASK_BUNDLE_DIGEST)
      expect(nop1.model_input_digest).toBe(A1_MODEL_INPUT_DIGEST)
      expect(nop1.task_bundle_digest).toBe(oracle1.task_bundle_digest)
      expect(nop1.model_input_digest).toBe(oracle1.model_input_digest)
    },
    60_000,
  )
})
