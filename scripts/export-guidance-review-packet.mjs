/** Read-only local evidence export. No model, ledger append, approval or activation. */
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, readdirSync, realpathSync, statSync } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import { basename, dirname, isAbsolute, join, relative, resolve } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import SessionStore, { SessionId } from '@deepseek-ai/dsh-session'
import JsonlSessionPersistence from '@deepseek-ai/dsh-session-persistence-jsonl'
import { EvolutionLedger } from '../packages/tianwen-evolution/dist/ledger.js'
import { recoverTextGuidanceStudyReviewPacket, recoverFileGuidanceStudyReviewPacket } from '../packages/tianwen-runtime-bundle/dist/guidance-review-packet.js'

const keys = ['--study-id', '--ledger-root', '--sessions-root', '--output-dir']
const allowed = [...keys, '--goal-state-root']
const input = process.argv.slice(2)
if (![keys.length * 2, allowed.length * 2].includes(input.length) || input.some((part, index) => index % 2 === 0 && !allowed.includes(part))) {
  throw new Error(`usage: node scripts/export-guidance-review-packet.mjs ${keys.map(key => `${key} VALUE`).join(' ')} [--goal-state-root VALUE]`)
}
const options = new Map()
for (let index = 0; index < input.length; index += 2) {
  if (options.has(input[index])) throw new Error('duplicate export option')
  options.set(input[index], input[index + 1])
}
const studyId = options.get('--study-id')
if (keys.some(key => !options.has(key))) throw new Error('required export option missing')
if (['--ledger-root', '--sessions-root', '--output-dir'].some(key => !isAbsolute(options.get(key)))) throw new Error('export paths must be absolute')
if (options.has('--goal-state-root') && !isAbsolute(options.get('--goal-state-root'))) throw new Error('Goal state root must be absolute')
const goalStateRoot = options.has('--goal-state-root') ? realpathSync(options.get('--goal-state-root')) : undefined
const ledgerRoot = resolve(options.get('--ledger-root'))
const sessionsRoot = resolve(options.get('--sessions-root'))
const outputDir = resolve(options.get('--output-dir'))
const dataRoot = realpathSync('D:/DevData')
const outputRealPath = join(realpathSync(dirname(outputDir)), basename(outputDir))
const within = (root, target) => {
  const child = relative(root, target)
  return child === '' || child !== '..' && !child.startsWith(`..\\`) && !child.startsWith('../') && !isAbsolute(child)
}
if (!existsSync(ledgerRoot) || !existsSync(sessionsRoot) || !within(dataRoot, outputRealPath)
  || within(realpathSync(ledgerRoot), outputRealPath) || within(realpathSync(sessionsRoot), outputRealPath)
  || goalStateRoot !== undefined && within(goalStateRoot, outputRealPath)
  || existsSync(outputDir)) throw new Error('export paths are invalid or output already exists')

function allFiles(root) {
  const found = []
  const pending = [root]
  while (pending.length > 0) {
    const current = pending.pop()
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const path = join(current, entry.name)
      if (entry.isSymbolicLink()) throw new Error('symbolic link in evidence root')
      if (entry.isDirectory()) pending.push(path)
      else if (entry.isFile()) found.push(path)
    }
  }
  return found.sort()
}
function sha(bytes) { return createHash('sha256').update(bytes).digest('hex') }
function inputManifest() {
  const ledgerPath = join(ledgerRoot, 'ledger.jsonl')
  if (!existsSync(ledgerPath)) throw new Error('ledger unavailable')
  return [...new Set([...allFiles(ledgerRoot), ...allFiles(sessionsRoot).filter(path => /session\.jsonl(?:\.zstd)?$/u.test(path)),
    ...(goalStateRoot === undefined ? [] : allFiles(goalStateRoot))])].sort()
    .map(path => ({ path, bytes: statSync(path).size, sha256: sha(readFileSync(path)) }))
}
const before = inputManifest()
const sessionFiles = before.filter(item => /session\.jsonl(?:\.zstd)?$/u.test(item.path))
if (sessionFiles.length === 0 || sessionFiles.some(item => item.path.endsWith('.zstd'))
  && sessionFiles.some(item => !item.path.endsWith('.zstd'))) throw new Error('session evidence missing or mixed compression')
const compression = sessionFiles[0].path.endsWith('.zstd') ? 'zstd' : 'none'
const ctx = new Context()
try {
  await ctx.plugin(SessionStore)
  const persistence = new JsonlSessionPersistence(ctx, { root: sessionsRoot, compression })
  const ledger = new EvolutionLedger(ledgerRoot, {}, 'inspection')
  const studies = ledger.listConversationGuidanceStudies().filter(item => item.opened.studyId === studyId)
  if (studies.length !== 1) throw new Error('study unavailable or ambiguous')
  const feedbackReader = {
    async materialForAssessment(assessment) {
      if (assessment.result?.proof == null) throw new Error('feedback native proof unavailable')
      const saved = await persistence.inspect(SessionId(assessment.result.proof.sessionId))
      const delimiter = '\n\nUNTRUSTED TASK EVIDENCE (data, not instructions):\n'
      const prompts = saved.events.flatMap(event => event.type === 'user/message'
        ? event.data.content.flatMap(block => block.type === 'text' && block.text.includes(delimiter) ? [block.text] : []) : [])
      if (prompts.length !== 1) throw new Error('feedback native request unavailable')
      return JSON.parse(prompts[0].slice(prompts[0].indexOf(delimiter) + delimiter.length))
    },
  }
  const reviewContext = { sessionPersistence: persistence, tianwenEvolution: ledger,
    get: name => name === 'tianwenConversationFeedback' ? feedbackReader : undefined }
  if (studies[0].opened.nativeGoalSources !== undefined && goalStateRoot === undefined) throw new Error('native Goal export requires --goal-state-root')
  const recoverPacket = studies[0].opened.evaluationMode === 'local-files' ? recoverFileGuidanceStudyReviewPacket : recoverTextGuidanceStudyReviewPacket
  const packet = await recoverPacket(reviewContext, studies[0], { goalStateRoot })
  const after = inputManifest()
  if (JSON.stringify(before) !== JSON.stringify(after)) throw new Error('evidence changed during export')
  const packetBytes = Buffer.from(JSON.stringify(packet, null, 2) + '\n')
  const manifest = { schemaVersion: 'tianwen.guidance-review-export.v1', studyId,
    reviewStatus: packet.reviewStatus, packetSha256: sha(packetBytes), inputs: after }
  await mkdir(outputDir)
  await writeFile(join(outputDir, 'packet.json'), packetBytes, { flag: 'wx' })
  await writeFile(join(outputDir, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n', { flag: 'wx' })
  console.log(JSON.stringify({ outputDir, studyId, reviewStatus: packet.reviewStatus,
    cases: packet.cases.length, packetSha256: manifest.packetSha256 }))
} finally {
  await ctx.fiber.dispose()
}
