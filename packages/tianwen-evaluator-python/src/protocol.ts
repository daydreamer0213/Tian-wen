import { createHash } from 'node:crypto'

export type Sha256Digest = `sha256:${string}`

export interface EvalRequestV1 {
  readonly schema_version: 'tianwen.eval_request.v1'
  readonly request_id: string
  readonly task_id: 'A1'
  readonly candidate_kind: 'nop' | 'oracle'
  readonly expected_task_bundle_digest: Sha256Digest
  readonly expected_model_input_digest: Sha256Digest
}

export interface EvalReceiptV1 {
  readonly schema_version: 'tianwen.eval_receipt.v1'
  readonly request_id: string
  readonly task_id: 'A1'
  readonly candidate_kind: 'nop' | 'oracle'
  readonly candidate_digest: Sha256Digest
  readonly task_bundle_digest: Sha256Digest
  readonly model_input_digest: Sha256Digest
  readonly verdict: 'met' | 'not_met' | 'inconclusive'
  readonly raw_stdout: string
  readonly raw_stdout_digest: Sha256Digest
}

const REQUEST_KEYS = [
  'candidate_kind',
  'expected_model_input_digest',
  'expected_task_bundle_digest',
  'request_id',
  'schema_version',
  'task_id',
] as const

const RECEIPT_KEYS = [
  'candidate_digest',
  'candidate_kind',
  'model_input_digest',
  'raw_stdout',
  'raw_stdout_digest',
  'request_id',
  'schema_version',
  'task_bundle_digest',
  'task_id',
  'verdict',
] as const

const VERIFIER_KEYS = [
  'failed_checks',
  'failure_categories',
  'passed_checks',
  'summary',
  'verdict',
] as const

const A1_CHECKS = [
  'escaped_quote',
  'escaped_quote_interior_whitespace',
  'malformed_quote',
  'ordinary_fields',
  'quoted_field_whitespace',
  'quoted_final_field_whitespace',
  'quoted_separator',
] as const

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
const SHA256 = /^sha256:[0-9a-f]{64}$/

export class EvalProtocolError extends Error {
  override readonly name = 'EvalProtocolError'
}

function fail(message: string): never {
  throw new EvalProtocolError(message)
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (
    value === null ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Object.prototype
  ) {
    fail(`${label} must be a plain object`)
  }
  return value as Record<string, unknown>
}

function exactKeys(
  value: Record<string, unknown>,
  expected: readonly string[],
  label: string,
): void {
  const actual = Object.keys(value).sort()
  const wanted = [...expected].sort()
  if (
    actual.length !== wanted.length ||
    actual.some((key, index) => key !== wanted[index])
  ) {
    fail(`${label} fields do not match the protocol`)
  }
}

function string(value: unknown, field: string): string {
  if (typeof value !== 'string') {
    fail(`${field} must be a string`)
  }
  return value
}

function requestId(value: unknown): string {
  const parsed = string(value, 'request_id')
  if (!UUID.test(parsed)) {
    fail('request_id must be a canonical UUID')
  }
  return parsed
}

function digest(value: unknown, field: string): Sha256Digest {
  const parsed = string(value, field)
  if (!SHA256.test(parsed)) {
    fail(`${field} must be an exact lowercase sha256 digest`)
  }
  return parsed as Sha256Digest
}

function candidateKind(value: unknown): 'nop' | 'oracle' {
  if (value !== 'nop' && value !== 'oracle') {
    fail('candidate_kind must be nop or oracle')
  }
  return value
}

function verdict(
  value: unknown,
): 'met' | 'not_met' | 'inconclusive' {
  if (value !== 'met' && value !== 'not_met' && value !== 'inconclusive') {
    fail('verdict is invalid')
  }
  return value
}

function stringArray(value: unknown, field: string): readonly string[] {
  if (!Array.isArray(value) || value.some(item => typeof item !== 'string')) {
    fail(`${field} must be an array of strings`)
  }
  return value as string[]
}

function parseVerifierStdout(rawStdout: string): 'met' | 'not_met' | 'inconclusive' {
  let parsed: unknown
  try {
    parsed = JSON.parse(rawStdout)
  } catch {
    fail('raw_stdout must contain one verifier JSON value')
  }
  const output = record(parsed, 'raw_stdout')
  exactKeys(output, VERIFIER_KEYS, 'raw_stdout')
  const passed = stringArray(output.passed_checks, 'raw_stdout.passed_checks')
  const failed = stringArray(output.failed_checks, 'raw_stdout.failed_checks')
  const categories = stringArray(
    output.failure_categories,
    'raw_stdout.failure_categories',
  )
  const summary = string(output.summary, 'raw_stdout.summary')
  const outputVerdict = verdict(output.verdict)
  if (summary !== `${passed.length}/7 checks passed`) {
    fail('raw_stdout summary does not match passed checks')
  }
  if (
    outputVerdict === 'met' &&
    (
      passed.length !== A1_CHECKS.length ||
      passed.some((check, index) => check !== A1_CHECKS[index]) ||
      failed.length !== 0 ||
      categories.length !== 0
    )
  ) {
    fail('raw_stdout cannot report met without exact 7/7 checks')
  }
  return outputVerdict
}

export function parseEvalRequest(value: unknown): EvalRequestV1 {
  const input = record(value, 'EvalRequestV1')
  exactKeys(input, REQUEST_KEYS, 'EvalRequestV1')
  if (input.schema_version !== 'tianwen.eval_request.v1') {
    fail('unsupported EvalRequestV1 schema_version')
  }
  if (input.task_id !== 'A1') {
    fail('EvalRequestV1 task_id must be A1')
  }
  return {
    schema_version: input.schema_version,
    request_id: requestId(input.request_id),
    task_id: input.task_id,
    candidate_kind: candidateKind(input.candidate_kind),
    expected_task_bundle_digest: digest(
      input.expected_task_bundle_digest,
      'expected_task_bundle_digest',
    ),
    expected_model_input_digest: digest(
      input.expected_model_input_digest,
      'expected_model_input_digest',
    ),
  }
}

export function parseEvalReceipt(
  value: unknown,
  expectedRequest: EvalRequestV1,
  expectedCandidateDigest: Sha256Digest,
): EvalReceiptV1 {
  const request = parseEvalRequest(expectedRequest)
  const candidateDigest = digest(
    expectedCandidateDigest,
    'expected_candidate_digest',
  )
  const input = record(value, 'EvalReceiptV1')
  exactKeys(input, RECEIPT_KEYS, 'EvalReceiptV1')
  if (input.schema_version !== 'tianwen.eval_receipt.v1') {
    fail('unsupported EvalReceiptV1 schema_version')
  }
  if (input.task_id !== 'A1') {
    fail('EvalReceiptV1 task_id must be A1')
  }
  const parsed: EvalReceiptV1 = {
    schema_version: input.schema_version,
    request_id: requestId(input.request_id),
    task_id: input.task_id,
    candidate_kind: candidateKind(input.candidate_kind),
    candidate_digest: digest(input.candidate_digest, 'candidate_digest'),
    task_bundle_digest: digest(
      input.task_bundle_digest,
      'task_bundle_digest',
    ),
    model_input_digest: digest(
      input.model_input_digest,
      'model_input_digest',
    ),
    verdict: verdict(input.verdict),
    raw_stdout: string(input.raw_stdout, 'raw_stdout'),
    raw_stdout_digest: digest(
      input.raw_stdout_digest,
      'raw_stdout_digest',
    ),
  }
  if (
    parsed.request_id !== request.request_id ||
    parsed.task_id !== request.task_id ||
    parsed.candidate_kind !== request.candidate_kind
  ) {
    fail('EvalReceiptV1 request, task, or candidate association is invalid')
  }
  if (
    parsed.task_bundle_digest !== request.expected_task_bundle_digest ||
    parsed.model_input_digest !== request.expected_model_input_digest
  ) {
    fail('EvalReceiptV1 task or model digest association is invalid')
  }
  if (parsed.candidate_digest !== candidateDigest) {
    fail('EvalReceiptV1 candidate digest association is invalid')
  }
  const actualStdoutDigest =
    `sha256:${createHash('sha256').update(parsed.raw_stdout).digest('hex')}` as Sha256Digest
  if (parsed.raw_stdout_digest !== actualStdoutDigest) {
    fail('EvalReceiptV1 raw_stdout digest association is invalid')
  }
  if (parsed.verdict !== parseVerifierStdout(parsed.raw_stdout)) {
    fail('EvalReceiptV1 verdict does not match raw_stdout')
  }
  return parsed
}
