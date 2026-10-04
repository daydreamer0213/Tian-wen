import assert from 'node:assert/strict'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseConversationFileMaterial, parseConversationQualityContract, sha256, type ConversationExternalCheckOutcome } from '@tianwen/evolution'
import type { ConversationAnswerStudyMaterial, ConversationAnswerStudyResultCheck } from './conversation-study-result-check.js'
import { canonicalJsonResult, isolatedPythonPolicy, prepareIsolatedPythonCli, type IsolatedPythonCliConfig } from './isolated-python-cli.js'

const checkerPath = fileURLToPath(import.meta.url), checkerSourceDigest = sha256(readFileSync(checkerPath))
const checkerId = 'tianwen.isolated-python-answer.v1'
export interface ConversationIsolatedPythonAnswerCase {
  readonly caseId: string
  /** Complete original case contract, independently known before the answer. */
  readonly material: ConversationAnswerStudyMaterial
  readonly requiredCondition: string
  /** Trusted host code, never candidate-generated. Only a JSON boolean is a valid result. */
  readonly verifierSource: string
}
export interface ConversationIsolatedPythonAnswerCheckConfig {
  readonly modelConfigDigest: ReturnType<typeof sha256>
  readonly cases: readonly ConversationIsolatedPythonAnswerCase[]
  readonly isolated: IsolatedPythonCliConfig
}
const packet = (material: ConversationAnswerStudyMaterial, answer: string, files: unknown) =>
  JSON.stringify({ schemaVersion: 'tianwen.answer-check.v1', material, answer, files })
function saveExact(path: string, text: string): void {
  if (existsSync(path)) assert.equal(readFileSync(path, 'utf8'), text)
  else writeFileSync(path, text, { flag: 'wx' })
}
/** Produces results only for explicit frozen host contracts; does not design cases or certify an arbitrary verifier. */
export function createConversationStudyIsolatedPythonAnswerCheck(raw: ConversationIsolatedPythonAnswerCheckConfig): ConversationAnswerStudyResultCheck {
  const config = structuredClone(raw)
  assert.match(config.modelConfigDigest, /^sha256:[a-f0-9]{64}$/u)
  assert(config.cases.length > 0 && config.cases.length <= 5)
  const definitions = new Map(config.cases.map(entry => {
    assert(typeof entry.caseId === 'string' && entry.caseId.trim() !== '' && Buffer.byteLength(entry.caseId) <= 512 && !entry.caseId.includes('\0'))
    assert(typeof entry.requiredCondition === 'string' && entry.requiredCondition.trim() !== '' && Buffer.byteLength(entry.requiredCondition) <= 4096 && !entry.requiredCondition.includes('\0'))
    assert(typeof entry.verifierSource === 'string' && entry.verifierSource.trim() !== '' && Buffer.byteLength(entry.verifierSource) <= isolatedPythonPolicy.sourceBytes)
    const material = entry.material
    assert(material && Array.isArray(material.criteria) && material.criteria.length > 0 && material.criteria.every(value => typeof value === 'string' && value.trim() !== ''))
    assert(['answer', 'guidance', 'role', 'verdict'].every(key => !Object.hasOwn(material, key)))
    if ('request' in material) assert(Array.isArray(material.request) && material.request.length > 0 && typeof material.objective === 'string' && material.objective.trim() !== '')
    else assert(typeof material.prompt === 'string' && material.prompt.trim() !== '')
    if (material.qualityContract !== undefined) parseConversationQualityContract(material.qualityContract)
    if (material.files !== undefined) {
      const files = parseConversationFileMaterial(material.files)
      assert(files.outputKind === 'chat' && files.outputPaths.length === 0)
    }
    assert(Buffer.byteLength(packet(material, '', material.files?.entries ?? [])) < isolatedPythonPolicy.ioBytes)
    return [entry.caseId, { ...entry, materialDigest: sha256(material) }] as const
  }))
  assert.equal(definitions.size, config.cases.length)
  return { async prepare(input) {
    input.signal.throwIfAborted()
    try {
      const entry = definitions.get(input.caseId)
      if (entry === undefined || input.modelConfigDigest !== config.modelConfigDigest || sha256(input.material) !== entry.materialDigest) return undefined
      assert.equal(sha256(readFileSync(checkerPath)), checkerSourceDigest)
      const runner = await prepareIsolatedPythonCli(config.isolated, input.signal)
      input.signal.throwIfAborted()
      const contract = JSON.stringify({ checkerId, checkerSourceDigest, executorDigest: runner.digest,
        modelConfigDigest: config.modelConfigDigest, ...entry })
      const contractDigest = sha256(contract), root = resolve(config.isolated.workRoot), manifestPath = resolve(root, `contract-${contractDigest.slice(7)}.json`)
      saveExact(manifestPath, contract)
      const unchanged = () => {
        assert.equal(sha256(readFileSync(checkerPath)), checkerSourceDigest)
        assert.equal(readFileSync(manifestPath, 'utf8'), contract)
      }
      return { checkerId, checkerDigest: sha256({ checkerSourceDigest, executorDigest: runner.digest, verifierDigest: sha256(entry.verifierSource) }),
        contractDigest, inputsDigest: entry.materialDigest, requiredCondition: entry.requiredCondition, waitsForCancellationCleanup: true,
        async evaluate(candidate) {
          candidate.signal.throwIfAborted()
          try {
            unchanged()
            const material = structuredClone(candidate.material), files = structuredClone(candidate.files), answer = candidate.answer
            assert.equal(sha256(material), entry.materialDigest)
            assert.equal(sha256(files), sha256(entry.material.files?.entries ?? []))
            assert(typeof answer === 'string')
            const inputPacket = packet(material, answer, files)
            assert(Buffer.byteLength(inputPacket) <= isolatedPythonPolicy.ioBytes)
            // Always execute the immutable host rule. The candidate answer is stdin data only.
            const result = await runner.run(entry.verifierSource, inputPacket, candidate.signal)
            candidate.signal.throwIfAborted(); unchanged()
            let status: ConversationExternalCheckOutcome['status'] = 'unverifiable'
            if (result.status === 'completed' && result.exitCode === 0 && result.stderr === '') {
              try { const value = canonicalJsonResult(result.stdout)
                if (value === 'true' || value === 'false') status = value === 'true' ? 'verified' : 'rejected'
              } catch { /* An invalid verifier result is not an original-task failure. */ }
            }
            const receipt = JSON.stringify({ contractDigest, packetDigest: sha256(inputPacket), status,
              ...(result.receiptDigest === undefined ? {} : { receiptDigest: result.receiptDigest }) })
            const receiptDigest = sha256(receipt)
            saveExact(resolve(root, `result-${receiptDigest.slice(7)}.json`), receipt)
            candidate.signal.throwIfAborted()
            return { status, detail: `Frozen host answer contract only; verifier execution ${receiptDigest}.`,
              ...(status === 'rejected' ? { failedRequiredConditionDigest: sha256(entry.requiredCondition) } : {}) }
          } catch { candidate.signal.throwIfAborted(); return { status: 'unverifiable', detail: 'Frozen answer contract, bounded verifier or evidence unavailable.' } }
        },
      }
    } catch { input.signal.throwIfAborted(); return undefined }
  } }
}
