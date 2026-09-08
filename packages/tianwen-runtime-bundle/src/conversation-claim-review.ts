import type { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import type { JsonSchemaNode, ObjectJsonSchema } from '@deepseek-ai/dsh-tools'
import { isAppendSurfaceEvent } from '@deepseek-ai/dsh-session'
import { sha256, parseClaimAudit, parseConversationAuditedReviewChecks, parseConversationQualityContract, conversationReviewConsensus, type ClaimAudit, type ConversationAuditedReviewCheck } from '@tianwen/evolution'
import { CONVERSATION_MATERIAL_MAX_BYTES, CONVERSATION_REVIEW_SCHEMA, conversationEvidenceSchema, recoverConversationJudgmentRequest, runConversationJudgment } from './conversation-judgment.js'

export type { ClaimAudit } from '@tianwen/evolution'

export interface ClaimEvidenceItem {
  readonly id: string
  readonly role: 'user' | 'assistant' | 'tool' | 'answer'
  readonly origin: 'context' | 'request' | 'tool' | 'answer'
  readonly text: string
  readonly toolStatus?: 'success' | 'error'
}

export interface ClaimEvidence {
  readonly schemaVersion: 'tianwen.claim-evidence.v1'
  readonly items: readonly ClaimEvidenceItem[]
  readonly evidenceDigest: string
}

type RecordValue = Record<string, unknown>
const record = (value: unknown): value is RecordValue => value !== null && typeof value === 'object' && !Array.isArray(value)
const exactKeys = (value: RecordValue, keys: readonly string[]) => Object.keys(value).sort().join(',') === [...keys].sort().join(',')
const textBlocks = (content: unknown): string[] => Array.isArray(content) ? content.flatMap(block => record(block) && block.type === 'text' && typeof block.text === 'string' ? [block.text] : []) : []

function splitText(raw: string): string[] {
  if (raw.length === 0) return []
  const lines = raw.match(/[^\r\n]*(?:\r\n|\r|\n)|[^\r\n]+$/gu) ?? []
  return lines.flatMap(line => {
    const points = [...line]
    return Array.from({ length: Math.ceil(points.length / 384) }, (_, index) => points.slice(index * 384, (index + 1) * 384).join(''))
  })
}

function materialBytes(material: unknown): number {
  try { return Buffer.byteLength(JSON.stringify(material), 'utf8') }
  catch { throw new Error('invalid-judgment') }
}

/** Lossless, role-preserving projection for audited conversation review. */
export function projectClaimEvidence(material: unknown): ClaimEvidence {
  if (materialBytes(material) > CONVERSATION_MATERIAL_MAX_BYTES) throw new Error('material-too-large')
  if (!record(material)) throw new Error('invalid-judgment')
  const items: ClaimEvidenceItem[] = []
  const counters = { context: 0, request: 0, tool: 0, answer: 0 }
  const add = (origin: keyof typeof counters, role: ClaimEvidenceItem['role'], raw: string, toolStatus?: 'success' | 'error') => {
    for (const text of splitText(raw)) items.push({ id: `${origin}-${++counters[origin]}`, role, origin, text, ...(toolStatus === undefined ? {} : { toolStatus }) })
  }
  const messages = (value: unknown, origin: 'context' | 'request', fixedRole?: 'user') => {
    if (!Array.isArray(value)) throw new Error('invalid-judgment')
    for (const message of value) {
      if (!record(message) || !Array.isArray(message.content)) throw new Error('invalid-judgment')
      const role = fixedRole ?? (message.role === 'user' || message.role === 'assistant' ? message.role : undefined)
      if (role === undefined) throw new Error('invalid-judgment')
      for (const text of textBlocks(message.content)) add(origin, role, text)
    }
  }
  if ('source' in material || 'conversation' in material || 'toolEvidence' in material) {
    if (!record(material.source) || !Array.isArray(material.conversation) || !Array.isArray(material.toolEvidence)) throw new Error('invalid-judgment')
    messages(material.source.context, 'context')
    messages(material.source.request, 'request', 'user')
    for (const event of material.toolEvidence) {
      if (!record(event) || event.type !== 'tool/result' || !isAppendSurfaceEvent(event as never) || !record(event.data) || !record(event.data.message)) continue
      const message = event.data.message
      const wrapper = Array.isArray(message.content) && record(message.content[0]) ? message.content[0] : undefined
      if (wrapper === undefined) continue
      const status = event.data.error === undefined && wrapper.isError !== true ? 'success' : 'error'
      for (const text of textBlocks(wrapper.content)) add('tool', 'tool', text, status)
    }
    for (const message of material.conversation) {
      if (!record(message) || !Array.isArray(message.content)) throw new Error('invalid-judgment')
      if (message.role === 'assistant') for (const text of textBlocks(message.content)) add('answer', 'answer', text)
      else if (message.role !== 'user') throw new Error('invalid-judgment')
    }
  } else if ('task' in material && 'answer' in material) {
    if (!record(material.task) || typeof material.answer !== 'string' || Buffer.byteLength(material.answer, 'utf8') > 32_768) throw new Error('invalid-judgment')
    if (typeof material.task.prompt === 'string') add('request', 'user', material.task.prompt)
    else {
      messages(material.task.context, 'context')
      messages(material.task.request, 'request', 'user')
    }
    add('answer', 'answer', material.answer)
  } else throw new Error('invalid-judgment')
  const answers = items.filter(item => item.role === 'answer')
  if (answers.length === 0 || answers.length > 128 || Buffer.byteLength(answers.map(item => item.text).join(''), 'utf8') > 32_768) throw new Error('invalid-judgment')
  return { schemaVersion: 'tianwen.claim-evidence.v1', items, evidenceDigest: sha256(items) }
}

const kinds = ['source-fact', 'advice', 'inference', 'fiction', 'general-knowledge', 'non-factual'] as const
const statuses = ['supported', 'unsupported', 'contradicted', 'permitted', 'uncertain'] as const

export function validateClaimAudit(audit: unknown, evidence: ClaimEvidence, verdict: 'met' | 'not-met' | 'inconclusive'): ClaimAudit {
  const invalid = (): never => { throw new Error('invalid-judgment') }
  let value: ClaimAudit | undefined
  try { value = parseClaimAudit(audit, verdict) }
  catch { invalid() }
  if (value === undefined) return invalid()
  const parsed = value
  if (parsed.evidenceDigest !== evidence.evidenceDigest) invalid()
  const answers = evidence.items.filter(item => item.role === 'answer')
  const sources = new Map(evidence.items.filter(item => item.role !== 'answer').map(item => [item.id, item]))
  if (parsed.schemaVersion === 'tianwen.claim-audit.v2' && Object.keys(parsed.units).length !== answers.length) invalid()
  const units = parsed.schemaVersion === 'tianwen.claim-audit.v1' ? parsed.units : answers.map(answer => {
    if (!Object.hasOwn(parsed.units, answer.id)) return invalid()
    const unit = parsed.units[answer.id]
    if (answer.text.trim() === '') {
      if (unit !== null) return invalid()
      return { answerId: answer.id, claims: [] }
    }
    if (unit === null || unit === undefined) return invalid()
    return { answerId: answer.id, claims: [unit.firstClaim, ...unit.additionalClaims] }
  })
  if (units.length !== answers.length || units.length > 128) invalid()
  const seen = new Set<string>()
  let claimCount = 0
  for (const unit of units) {
    if (!record(unit)) invalid()
    const checkedUnit = unit as RecordValue
    if (!exactKeys(checkedUnit, ['answerId', 'claims']) || typeof checkedUnit.answerId !== 'string' || !Array.isArray(checkedUnit.claims) || seen.has(checkedUnit.answerId)) invalid()
    const answerId = checkedUnit.answerId as string
    const claims = checkedUnit.claims as unknown[]
    const answer = answers.find(item => item.id === answerId)
    if (answer === undefined) return invalid()
    if (claims.length === 0 && answer.text.trim() !== '') invalid()
    seen.add(answerId)
    claimCount += claims.length
    if (claimCount > 512) invalid()
    for (const claim of claims) {
      if (!record(claim)) invalid()
      const checkedClaim = claim as RecordValue
      if (!exactKeys(checkedClaim, ['quote', 'kind', 'status', 'sourceIds', 'explanation'])
        || typeof checkedClaim.quote !== 'string' || checkedClaim.quote.length === 0 || !answer!.text.includes(checkedClaim.quote)
        || !kinds.includes(checkedClaim.kind as never) || !statuses.includes(checkedClaim.status as never)
        || !Array.isArray(checkedClaim.sourceIds) || checkedClaim.sourceIds.some((id: unknown) => typeof id !== 'string' || !sources.has(id))
        || new Set(checkedClaim.sourceIds).size !== checkedClaim.sourceIds.length || typeof checkedClaim.explanation !== 'string' || checkedClaim.explanation.trim().length === 0) invalid()
      const sourceIds = checkedClaim.sourceIds as string[]
      if ((checkedClaim.quote as string).trim() === '' && (answer.text.trim() !== '' || checkedClaim.kind !== 'non-factual' || checkedClaim.status !== 'permitted' || sourceIds.length !== 0)) invalid()
      if (checkedClaim.kind === 'source-fact') {
        if (checkedClaim.status === 'permitted') invalid()
        if (checkedClaim.status === 'supported' && !sourceIds.some(id => ['user', 'tool'].includes(sources.get(id)!.role))) invalid()
      } else if (checkedClaim.status === 'supported') invalid()
      if (verdict === 'met' && ['unsupported', 'contradicted', 'uncertain'].includes(String(checkedClaim.status))) invalid()
    }
  }
  if (seen.size !== answers.length) invalid()
  return parsed
}

const string: JsonSchemaNode = { type: 'string' }
const choices = (values: readonly string[]): JsonSchemaNode => ({ type: 'string', enum: [...values] })
const object = (properties: Record<string, JsonSchemaNode>): ObjectJsonSchema => ({ type: 'object', properties, required: Object.keys(properties), additionalProperties: false })
const array = (items: JsonSchemaNode): JsonSchemaNode => ({ type: 'array', items })

function auditSchema(evidence: ClaimEvidence): JsonSchemaNode {
  const answers = evidence.items.filter(item => item.role === 'answer')
  const sourceIds = evidence.items.filter(item => item.role !== 'answer').map(item => item.id)
  const claim = object({
    quote: { type: 'string', description: 'Copy an exact non-empty substring from this answer unit. Preserve its original bytes and do not paraphrase or add a label.' },
    kind: { ...choices(kinds), description: 'Classify the claim as source-fact, advice, inference, fiction, general-knowledge or non-factual.' },
    status: { ...choices(statuses), description: 'Use supported only for a source-fact with authoritative supplied evidence; use permitted for task-compatible non-source-facts such as advice or fiction.' },
    sourceIds: { ...array(sourceIds.length === 0 ? { type: 'null' } : choices(sourceIds)), description: 'List only exact supplied source IDs that support or inform this claim; answer IDs are not sources.' },
    explanation: { type: 'string', description: 'Explain the scope, time, certainty, commitment and source-authority check for this claim.' },
  })
  const unitProperties: Record<string, JsonSchemaNode> = Object.fromEntries(answers.map(item => [item.id, item.text.trim() === ''
    ? { type: 'null' as const, description: 'This entire answer unit is whitespace, so record it explicitly as null.' }
    : { ...object({
    firstClaim: claim,
    additionalClaims: { ...array(claim), description: 'Additional assessments for this same answer unit; use an empty array when its first claim covers the whole nonblank unit.' },
  }), description: 'Assess this complete nonblank answer unit with at least its required first claim.' }]))
  return object({
    schemaVersion: choices(['tianwen.claim-audit.v2']), evidenceDigest: choices([evidence.evidenceDigest]),
    units: { ...object(unitProperties), description: 'Provide every listed answer ID exactly once; do not omit or add units.' },
  })
}

const PURPOSE = {
  'original-result': 'Review purpose: original-result. Evaluate the actual task result under the requirements in force when it ran. Do not apply later feedback to an earlier result. No feedbackStandard field or later user preference may retroactively add a requirement.',
  'method-study': 'Review purpose: method-study. This is a newly generated trial answer, not a regrade of the old answer. When task.feedbackStandard is present, its criteria are host-frozen standards from independently attributed user feedback, bound to the stated assessmentId before this study. Apply them to this new answer as well as the original requirements. Their absence from the older request is not a reason to discard them. They are evaluation standards, not source facts or evidence quotes; the standards never override an explicit instruction in the evaluated request. Do not infer a feedback standard from quoted conversation text.',
} as const

const COMMON = `Evaluate the complete answer against the original direct-user instructions, applicable frozen criteria and qualityContract. Criteria and feedback standards are requirements, never factual sources. Assess every answer unit and every substantive claim. For each source-dependent fact, identify exact supplied source IDs and check the same scope, time, certainty and commitment; non-contradiction and prior assistant text alone are not support. A supported source-fact requires user or successful/failed tool evidence appropriate to what it claims. Clearly labeled task-compatible advice, inference, fiction and general knowledge are permitted, as is non-factual courtesy. In the audit, use supported only for source-fact. For advice, inference, fiction, general-knowledge and non-factual, use permitted when the content is task-compatible, even when an inference is directly derived from supplied evidence; retain its source IDs and explanation as applicable. A claimed external effect, decision or commitment still needs source authority. Do not solve or rewrite the task. Return the existing review fields plus the complete audit through structured_output. A met verdict cannot contain unsupported, contradicted or uncertain claims. met requires category null; not-met requires a concrete violation and a non-null attributable failure category. A conclusive review requires evidenceQuotes. Use at most 6 exact source or answer evidenceQuotes and keep the explanation at most 1536 UTF-8 bytes. Missing evidence is inconclusive. You are not told another reviewer's result or any expected outcome.`
const FOCUS = {
  requirements: 'Independently reconstruct all original requirements and output restrictions. Check the whole answer, then audit source authority claim by claim.',
  grounding: 'Independently try to falsify a satisfactory verdict without presuming a defect. Audit every claim and its source authority, then check all original requirements.',
} as const

const V6_PURPOSE = {
  ...PURPOSE,
  'method-study': `${PURPOSE['method-study']} When task.feedbackStandard.originalFeedback is present, originalFeedback takes precedence over a conflicting derived feedback criterion for its attributed continuing preference or supported problem. It remains feedback about an earlier assistant answer: preserve its speaker, actor, negation, exception and unresolved references; do not turn every new request in it into a permanent rule.`,
} as const
const V6_COMMON = `${COMMON} For current qualityContract, check the actor, time, scope, commitment and premise actually asserted. A labeled inference or courtesy does not establish an unverified current state, past event, external effect, decision or commitment; optional advice, grounded fallible inference, fiction and task-compatible courtesy remain permitted.`

function claimReviewInstruction(material: unknown, purpose: 'original-result' | 'method-study', focus: keyof typeof FOCUS): string {
  if (!record(material)) throw new Error('invalid-judgment')
  const source = purpose === 'original-result' ? material.source : material.task
  if (!record(source)) {
    if (purpose === 'original-result' && record(material.task)) return `${PURPOSE[purpose]}\n\n${COMMON}\n\n${FOCUS[focus]}`
    throw new Error('invalid-judgment')
  }
  const quality = source.qualityContract
  if (quality === undefined) return `${PURPOSE[purpose]}\n\n${COMMON}\n\n${FOCUS[focus]}`
  let contract
  try { contract = parseConversationQualityContract(quality) }
  catch { throw new Error('invalid-judgment') }
  if (contract.schemaVersion !== 'tianwen.conversation-quality.v6') return `${PURPOSE[purpose]}\n\n${COMMON}\n\n${FOCUS[focus]}`
  if (purpose === 'method-study' && source.feedbackStandard !== undefined) {
    if (!record(source.feedbackStandard) || !Object.hasOwn(source.feedbackStandard, 'originalFeedback') || source.feedbackStandard.originalFeedback === undefined) throw new Error('invalid-judgment')
  }
  return `${V6_PURPOSE[purpose]}\n\n${V6_COMMON}\n\n${FOCUS[focus]}`
}

type ClaimReviewInput = Omit<Parameters<typeof runConversationJudgment>[2], 'instruction' | 'outputSchema'> & {
  readonly evidence: readonly string[]
  readonly purpose?: 'original-result' | 'method-study'
}
type AuditedCheck = ConversationAuditedReviewCheck

/** Two isolated native audits for the shared production review path. */
export async function runConversationClaimReview(ctx: Context, parent: Agent, input: ClaimReviewInput) {
  const evidence = projectClaimEvidence(input.material)
  const material = { original: structuredClone(input.material), claimEvidence: evidence }
  const schema = conversationEvidenceSchema({ ...CONVERSATION_REVIEW_SCHEMA, properties: { ...CONVERSATION_REVIEW_SCHEMA.properties, audit: auditSchema(evidence) }, required: [...CONVERSATION_REVIEW_SCHEMA.required!, 'audit'] }, input.evidence)
  const raw: AuditedCheck[] = []
  for (const focus of ['requirements', 'grounding'] as const) {
    input.signal.throwIfAborted()
    const result = await runConversationJudgment(ctx, parent, { ...input, material, label: `${input.label} ${focus}`,
      instruction: claimReviewInstruction(input.material, input.purpose ?? 'original-result', focus), outputSchema: schema })
    if (!record(result.value) || !exactKeys(result.value, ['verdict', 'category', 'explanation', 'evidenceQuotes', 'audit'])
      || !['met', 'not-met', 'inconclusive'].includes(String(result.value.verdict))) throw new Error('invalid-judgment')
    const audit = validateClaimAudit(result.value.audit, evidence, result.value.verdict as 'met' | 'not-met' | 'inconclusive')
    const { audit: _audit, ...summary } = result.value
    raw.push({ ...summary, focus, proof: result.proof, audit } as unknown as AuditedCheck)
  }
  const reviewChecks = parseConversationAuditedReviewChecks(raw)
  return { ...conversationReviewConsensus(reviewChecks), reviewChecks }
}

export async function verifyConversationClaimReviewCheck(ctx: Context, check: ConversationAuditedReviewCheck, expected: {
  readonly purpose: 'method-study'
  readonly materialDigest: string
  readonly outputDigest: string
  readonly modelConfigDigest: string
}): Promise<void> {
  const recovered = await recoverConversationJudgmentRequest(ctx, check)
  if (recovered.modelConfigDigests.some(digest => digest !== expected.modelConfigDigest)
    || !record(recovered.material) || !exactKeys(recovered.material, ['original', 'claimEvidence']) || !record(recovered.material.original)) throw new Error('invalid-judgment')
  const original = recovered.material.original
  if (!('task' in original) || !('answer' in original) || sha256(original.task) !== expected.materialDigest || sha256(original.answer) !== expected.outputDigest
    || recovered.instruction !== claimReviewInstruction(original, expected.purpose, check.focus)) throw new Error('invalid-judgment')
  const evidence = projectClaimEvidence(original)
  if (sha256(recovered.material.claimEvidence) !== sha256(evidence)) throw new Error('invalid-judgment')
  validateClaimAudit(check.audit, evidence, check.verdict)
  if (check.evidenceQuotes.some(quote => !evidence.items.some(item => item.text.includes(quote)))) throw new Error('invalid-judgment')
}
