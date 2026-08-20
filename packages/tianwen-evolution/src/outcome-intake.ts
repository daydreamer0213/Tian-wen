import type { Sha256Digest } from './ledger.js'
import { normalizeLearningText, sha256 } from './learning-intake.js'

export type TianwenRunId = `run:${string}`
export type OutcomeSeverity = 1 | 2 | 3 | 4 | 5

interface ToolAcceptanceBase {
  readonly source: 'dsh-tool-result'
  readonly toolName: string
  readonly notMetErrorCode: string
}

export type RunAcceptanceContract =
  | (ToolAcceptanceBase & {
      readonly gapDisposition: 'observe' | 'ordinary-correction'
    })
  | (ToolAcceptanceBase & {
      readonly gapDisposition: 'reusable'
      readonly problemCategory: string
      readonly severity: OutcomeSeverity
      readonly blocksGoal: boolean
    })

export interface RunBindingInput {
  readonly goalRef: string
  readonly taskRef: string
  readonly sessionId: string
  readonly scopeKey: string
  readonly acceptanceContract: RunAcceptanceContract
}

export interface TianwenRunBinding extends RunBindingInput {
  readonly schemaVersion: 'tianwen.run-binding.v1'
  readonly runId: TianwenRunId
  readonly acceptanceContractDigest: Sha256Digest
}

export interface RunBindingReceipt {
  readonly runId: TianwenRunId
  readonly duplicate: boolean
}

export interface RunBindingRecordedEvent {
  readonly schemaVersion: 'tianwen.run-binding.v1'
  readonly type: 'run-binding-recorded'
  readonly at: string
  readonly binding: TianwenRunBinding
  readonly inputDigest: Sha256Digest
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function exactKeys(value: Record<string, unknown>, expected: readonly string[]): void {
  const keys = Object.keys(value)
  if (
    keys.length !== expected.length ||
    expected.some(key => !(key in value)) ||
    keys.some(key => !expected.includes(key))
  ) {
    throw new TypeError('Run binding input has an invalid shape')
  }
}

function nonBlank(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new TypeError(`${label} must be a non-blank string`)
  }
  return value.trim()
}

function validateRunBindingInput(input: RunBindingInput): RunBindingInput {
  if (!isRecord(input)) {
    throw new TypeError('Run binding input must be an object')
  }
  exactKeys(input, [
    'goalRef',
    'taskRef',
    'sessionId',
    'scopeKey',
    'acceptanceContract',
  ])
  const contract = input.acceptanceContract
  if (!isRecord(contract)) {
    throw new TypeError('acceptanceContract must be an object')
  }
  if (contract.source !== 'dsh-tool-result') {
    throw new TypeError('acceptanceContract source must be dsh-tool-result')
  }
  const toolName = nonBlank(contract.toolName, 'toolName')
  const notMetErrorCode = nonBlank(
    contract.notMetErrorCode,
    'notMetErrorCode',
  )
  const gapDisposition = contract.gapDisposition
  let acceptanceContract: RunAcceptanceContract
  if (
    gapDisposition === 'observe' ||
    gapDisposition === 'ordinary-correction'
  ) {
    exactKeys(contract, [
      'source',
      'toolName',
      'notMetErrorCode',
      'gapDisposition',
    ])
    acceptanceContract = {
      source: 'dsh-tool-result',
      toolName,
      notMetErrorCode,
      gapDisposition,
    }
  } else if (gapDisposition === 'reusable') {
    exactKeys(contract, [
      'source',
      'toolName',
      'notMetErrorCode',
      'gapDisposition',
      'problemCategory',
      'severity',
      'blocksGoal',
    ])
    const problemCategory = normalizeLearningText(
      nonBlank(contract.problemCategory, 'problemCategory'),
    )
    if (
      !Number.isInteger(contract.severity) ||
      (contract.severity as number) < 1 ||
      (contract.severity as number) > 5
    ) {
      throw new TypeError('severity must be an integer from 1 to 5')
    }
    if (typeof contract.blocksGoal !== 'boolean') {
      throw new TypeError('blocksGoal must be a boolean')
    }
    acceptanceContract = {
      source: 'dsh-tool-result',
      toolName,
      notMetErrorCode,
      gapDisposition,
      problemCategory,
      severity: contract.severity as OutcomeSeverity,
      blocksGoal: contract.blocksGoal,
    }
  } else {
    throw new TypeError('acceptanceContract has an invalid gapDisposition')
  }
  return {
    goalRef: nonBlank(input.goalRef, 'goalRef'),
    taskRef: nonBlank(input.taskRef, 'taskRef'),
    sessionId: nonBlank(input.sessionId, 'sessionId'),
    scopeKey: nonBlank(input.scopeKey, 'scopeKey'),
    acceptanceContract,
  }
}

export function prepareRunBinding(input: RunBindingInput): TianwenRunBinding {
  const validated = validateRunBindingInput(input)
  const acceptanceContractDigest = sha256(validated.acceptanceContract)
  const runDigest = sha256({
    goalRef: validated.goalRef,
    taskRef: validated.taskRef,
    sessionId: validated.sessionId,
    scopeKey: validated.scopeKey,
    acceptanceContractDigest,
  })
  return {
    schemaVersion: 'tianwen.run-binding.v1',
    runId: `run:${runDigest.slice('sha256:'.length)}`,
    ...validated,
    acceptanceContractDigest,
  }
}
