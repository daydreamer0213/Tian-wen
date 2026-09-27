/** Render a verified local review packet for reading. This never judges or activates a method. */
import { createHash } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import { realpathSync } from 'node:fs'
import { isAbsolute, join, relative, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const sha = bytes => createHash('sha256').update(bytes).digest('hex')
const expectedCases = ['source1', 'source2', 'counterexample', 'adjacent', 'holdout']

export function verifyGuidanceReviewPacket(bytes, manifest) {
  if (manifest?.schemaVersion !== 'tianwen.guidance-review-export.v1' || manifest.packetSha256 !== sha(bytes)) {
    throw new Error('review packet SHA-256 does not match manifest')
  }
  const packet = JSON.parse(bytes.toString('utf8'))
  if (packet.schemaVersion !== 'tianwen.guidance-review-packet.v1'
    || packet.opened?.studyId !== manifest.studyId || packet.reviewStatus !== manifest.reviewStatus
    || !['unreviewed', 'diagnostic-historical'].includes(packet.reviewStatus)
    || (packet.reviewStatus === 'unreviewed' && packet.activation !== undefined)
    || (packet.reviewStatus === 'diagnostic-historical' && packet.activation === undefined)
    || packet.decision?.verdict !== 'accepted' || packet.candidate?.candidateSnapshot === undefined
    || !Array.isArray(packet.cases) || packet.cases.length !== 5
    || packet.cases.some((item, index) => item.id !== expectedCases[index]
      || item.baseline?.role !== 'baseline' || item.candidate?.role !== 'candidate'
      || item.baseline?.caseId !== item.id || item.candidate?.caseId !== item.id
      || !Array.isArray(item.baseline.reviews) || item.baseline.reviews.length !== 2
      || !Array.isArray(item.candidate.reviews) || item.candidate.reviews.length !== 2)) {
    throw new Error('review packet identity or shape is invalid')
  }
  return packet
}

function fenced(value) {
  const publicView = item => Array.isArray(item) ? item.map(publicView)
    : item !== null && typeof item === 'object' ? Object.fromEntries(Object.entries(item)
      .filter(([key]) => !(item.role === 'assistant' && key === 'reasoning'))
      .map(([key, part]) => [key, item.role === 'assistant' && key === 'content' && Array.isArray(part)
        ? part.filter(block => block?.type !== 'reasoning').map(publicView) : publicView(part)])) : item
  const body = typeof value === 'string' ? value : JSON.stringify(publicView(value), null, 2)
  if (typeof body !== 'string' || body.length === 0) throw new Error('review content is empty')
  const longest = Math.max(2, ...[...body.matchAll(/`+/gu)].map(item => item[0].length))
  const mark = '`'.repeat(longest + 1)
  return `${mark}\n${body}\n${mark}`
}

function originalAnswerText(messages) {
  const texts = messages?.filter(message => message.role === 'assistant')
    .flatMap(message => message.content?.filter(block => block.type === 'text').map(block => block.text) ?? [])
  if (!Array.isArray(texts) || texts.length === 0 || texts.some(text => typeof text !== 'string' || text.length === 0)) {
    throw new Error('original assistant answer is unavailable')
  }
  return texts.join('\n\n')
}

function judgments(reviews) {
  return reviews.map((review, index) => [
    `评审 ${index + 1}：${review.verdict ?? '未给结论'}${review.focus ? `（${review.focus}）` : ''}`,
    fenced({ explanation: review.explanation, evidenceQuotes: review.evidenceQuotes,
      ...(review.audit?.units === undefined ? {} : { auditUnits: review.audit.units }) }),
  ].join('\n\n')).join('\n\n')
}

export function renderGuidanceReviewMarkdown(packet, manifest) {
  const lines = [
    '# 方法研究审查阅读本',
    '',
    `研究：${packet.opened.studyId}`,
    `审查状态：${packet.reviewStatus}。${packet.reviewStatus === 'diagnostic-historical' ? '历史诊断，不能用于新方法放行。' : '待独立审查，不代表方法已获放行。'}`,
    `原始审查包 SHA-256：${manifest.packetSha256}`,
    '本文件是阅读视图；准确身份与原生证明以同目录 packet.json、manifest.json 为准。这里只展示回答正文，不展示模型内部推理。',
    '',
    '## 研究与候选方法',
    '',
    fenced({ opened: packet.opened, decision: packet.decision,
      activation: packet.activation ?? null, currentConsent: packet.currentConsent, currentSupport: packet.currentSupport }),
    '',
    '候选方法原文：',
    '',
    fenced(packet.candidate.candidateSnapshot),
    '',
    '候选提案当时看到的材料：',
    '',
    fenced(packet.proposalMaterial),
  ]
  for (const item of packet.cases) {
    lines.push('', `## ${item.id}（${item.kind}）`, '')
    if (item.originalMaterial !== undefined) {
      lines.push('原任务材料：', '', fenced(item.originalMaterial), '', '原任务回答正文：', '', fenced(originalAnswerText(item.originalAnswer)))
      if (item.originalTaskReview !== undefined) {
        lines.push('', `原任务汇总结论：${item.originalTaskReview.verdict}`, '', fenced({ explanation: item.originalTaskReview.explanation,
          evidenceQuotes: item.originalTaskReview.evidenceQuotes }), '', '原任务两份评审：', '', judgments(item.originalTaskReview.reviewChecks))
      }
    }
    if (item.feedback !== undefined) {
      lines.push('', '原反馈与派生标准（并排核对说话者、行动者和范围）：', '', fenced(item.feedback))
    }
    lines.push('', '本案例冻结试验任务（含当时研究使用的标准）：', '', fenced(item.baseline.task))
    for (const arm of [item.baseline, item.candidate]) {
      lines.push('', `### ${arm.role}`, '', '完整回答正文：', '', fenced(arm.answer), '', '两份原生评审：', '', judgments(arm.reviews))
    }
  }
  lines.push('', '本阅读本没有独立结论。逐项判断请填写项目的独立语义审查工作单；不要依据模型评审的 met 数字直接放行。', '')
  return lines.join('\n')
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const args = process.argv.slice(2)
  if (args.length !== 2 || args[0] !== '--packet-dir' || !isAbsolute(args[1])) {
    throw new Error('usage: node scripts/render-guidance-review-packet.mjs --packet-dir D:/DevData/EXPORTED_DIR')
  }
  const directory = realpathSync(args[1])
  const dataRoot = realpathSync('D:/DevData')
  const child = relative(dataRoot, directory)
  if (child === '' || child === '..' || child.startsWith('../') || child.startsWith('..\\') || isAbsolute(child)) {
    throw new Error('review packet must be under D:/DevData')
  }
  const bytes = await readFile(join(directory, 'packet.json'))
  const manifest = JSON.parse(await readFile(join(directory, 'manifest.json'), 'utf8'))
  const packet = verifyGuidanceReviewPacket(bytes, manifest)
  const markdown = renderGuidanceReviewMarkdown(packet, manifest)
  await writeFile(join(directory, 'review.md'), markdown, { flag: 'wx' })
  console.log(JSON.stringify({ path: join(directory, 'review.md'), packetSha256: manifest.packetSha256,
    reviewStatus: packet.reviewStatus, cases: packet.cases.length, sha256: sha(Buffer.from(markdown)) }))
}
