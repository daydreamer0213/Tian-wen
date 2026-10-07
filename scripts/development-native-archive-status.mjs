// 原归档事实的易读投影。
//
// 纯模块：仅导出 formatDevelopmentNativeArchiveStatus(verification, summary, options?)。
// 无 I/O、无依赖、不执行命令、不修改输入、不共享可变返回对象。
// 分类只呈现既有事实，不制造成功、资格或方法激活标签。
// 可选 options 只用于投影既有文件观察诊断，绝不读取磁盘或解释其余可选字段。

const VERIFICATION_FIELDS = ['sessionMatches', 'filesMatch', 'complete', 'missing', 'changed', 'added']
const SUMMARY_FIELDS = [
  'taskId',
  'completionStatus',
  'functionalStatus',
  'reviewVerdict',
  'permissionSetExact',
  'functionalCandidateVerified',
]

const COMPLETION_LABELS = new Map([
  ['completed', '任务已结束'],
  ['interrupted', '任务中断'],
  ['failed', '执行失败'],
])
const COMPLETION_MISSING = '任务状态缺失'

const FUNCTIONAL_LABELS = new Map([
  ['verified', '原程序检查记录：通过'],
  ['rejected', '原程序检查记录：未通过'],
  ['unverifiable', '原程序检查记录：无法核验'],
])
const FUNCTIONAL_MISSING = '原程序尚无检查记录'

const REVIEW_LABELS = new Map([
  ['met', '整体评审通过'],
  ['not-met', '整体评审未通过'],
  ['inconclusive', '整体评审未定'],
])
const REVIEW_MISSING = '尚未整体评审'

const DISPOSITION = '以上为原归档事实，不代表方法已采用或自动学习已完成。'

// 可选诊断投影：只转述既有观察失败原因，不评估、不修复、不重跑。
const DIAGNOSTIC_DISPOSITION = '诊断只说明观察失败原因，不改变原任务或学习资格。'
const DIAGNOSTIC_FIELDS = ['records', 'observedCount', 'truncated']
const DIAGNOSTIC_RECORD_FIELDS = [
  'sourceSequence',
  'sourceTimestamp',
  'taskId',
  'sessionId',
  'phase',
  'detail',
  'detailTruncated',
]
const MAX_DIAGNOSTIC_RECORDS = 16
const MAX_DETAIL_CODE_POINTS = 512
const PHASE_STAGES = new Map([
  ['prepare', '准备文件观察时'],
  ['capture', '读取原文件证据时'],
  ['freeze', '保存最终文件证据时'],
  ['unavailable-record', '记录证据不可用时'],
])

function fail(message) {
  throw new TypeError(`formatDevelopmentNativeArchiveStatus: ${message}`)
}

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

// 字段集合必须恰好一致：不得缺失、不得多出（含 symbol 等自有键）。
function hasExactFields(value, fields) {
  if (Reflect.ownKeys(value).length !== fields.length) return false
  return fields.every((field) => Object.prototype.hasOwnProperty.call(value, field))
}

function requireBoolean(record, field) {
  if (typeof record[field] !== 'boolean') fail(`${field} 必须是布尔值`)
}

function requireStringArray(record, field) {
  const value = record[field]
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) {
    fail(`${field} 必须是字符串数组`)
  }
}

function requireStatus(record, field, labels) {
  const value = record[field]
  if (value !== null && !labels.has(value)) fail(`${field} 取值不受支持`)
}

function project(value, labels, missingLabel) {
  return value === null ? missingLabel : labels.get(value)
}

// 仅当诊断与本次 Task/session 完全一致且未截断/未超限地自洽时返回投影，否则整体忽略。
// 不抛新错误、不修改输入、不回显任何未声明的可选字段。
function projectFileObservationDiagnostics(options, taskId) {
  if (!isRecord(options)) return null
  const { sessionId } = options
  if (typeof sessionId !== 'string' || sessionId.length === 0) return null
  if (typeof taskId !== 'string' || taskId.length === 0) return null

  const source = options.fileObservationDiagnostics
  if (!isRecord(source) || !hasExactFields(source, DIAGNOSTIC_FIELDS)) return null

  const { records, observedCount, truncated } = source
  if (!Array.isArray(records) || records.length < 1 || records.length > MAX_DIAGNOSTIC_RECORDS) return null
  if (!Number.isSafeInteger(observedCount) || observedCount < records.length) return null
  if (typeof truncated !== 'boolean' || truncated !== (observedCount > records.length)) return null

  const items = []
  let previousSequence = 0
  for (const record of records) {
    if (!isRecord(record) || !hasExactFields(record, DIAGNOSTIC_RECORD_FIELDS)) return null

    const phase = record.phase
    const stage = PHASE_STAGES.get(phase)
    if (stage === undefined) return null

    const { sourceSequence, sourceTimestamp, detail, detailTruncated } = record
    if (!Number.isSafeInteger(sourceSequence) || sourceSequence <= previousSequence) return null
    if (typeof sourceTimestamp !== 'number' || !Number.isFinite(sourceTimestamp) || sourceTimestamp < 0) return null
    if (record.taskId !== taskId || record.sessionId !== sessionId) return null
    if (typeof detail !== 'string' || [...detail].length > MAX_DETAIL_CODE_POINTS) return null
    if (typeof detailTruncated !== 'boolean') return null

    previousSequence = sourceSequence
    items.push({ stage, detail, detailTruncated })
  }

  return { items, observedCount, truncated, disposition: DIAGNOSTIC_DISPOSITION }
}

export function formatDevelopmentNativeArchiveStatus(verification, summary, options) {
  if (!isRecord(verification) || !hasExactFields(verification, VERIFICATION_FIELDS)) {
    fail('verification 必须恰含预期字段')
  }
  if (!isRecord(summary) || !hasExactFields(summary, SUMMARY_FIELDS)) {
    fail('summary 必须恰含预期字段')
  }

  requireBoolean(verification, 'sessionMatches')
  requireBoolean(verification, 'filesMatch')
  requireBoolean(verification, 'complete')
  requireStringArray(verification, 'missing')
  requireStringArray(verification, 'changed')
  requireStringArray(verification, 'added')

  const { taskId } = summary
  if (taskId !== null && (typeof taskId !== 'string' || taskId.length === 0)) {
    fail('taskId 必须是非空字符串或 null')
  }
  requireBoolean(summary, 'permissionSetExact')
  requireBoolean(summary, 'functionalCandidateVerified')
  requireStatus(summary, 'completionStatus', COMPLETION_LABELS)
  requireStatus(summary, 'functionalStatus', FUNCTIONAL_LABELS)
  requireStatus(summary, 'reviewVerdict', REVIEW_LABELS)

  // 一致性：complete 为 true 时不得有会话/文件不匹配。
  if (verification.complete === true && (verification.sessionMatches !== true || verification.filesMatch !== true)) {
    fail('complete 为 true 时不能同时报会话或文件不匹配')
  }
  // 一致性：filesMatch 为 true 时不得同时存在任一差异条目。
  if (
    verification.filesMatch === true &&
    (verification.missing.length > 0 || verification.changed.length > 0 || verification.added.length > 0)
  ) {
    fail('filesMatch 为 true 时不能同时存在差异条目')
  }

  let archive
  if (verification.sessionMatches !== true) {
    archive = '会话不匹配'
  } else if (verification.filesMatch !== true) {
    archive = '归档已变化'
  } else if (verification.complete !== true) {
    archive = '归档文件不完整'
  } else {
    archive = '归档字节一致且文件集合完整'
  }

  const status = {
    archive,
    completion: project(summary.completionStatus, COMPLETION_LABELS, COMPLETION_MISSING),
    functional: project(summary.functionalStatus, FUNCTIONAL_LABELS, FUNCTIONAL_MISSING),
    review: project(summary.reviewVerdict, REVIEW_LABELS, REVIEW_MISSING),
    disposition: DISPOSITION,
  }

  // 合格诊断只在原归档完整且与本次 Task/session 一致时出现；否则返回对象与旧版完全一致。
  if (verification.complete === true) {
    const diagnostics = projectFileObservationDiagnostics(options, summary.taskId)
    if (diagnostics !== null) status.diagnostics = diagnostics
  }

  return status
}
