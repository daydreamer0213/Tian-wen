#!/usr/bin/env node
/**
 * summarize-learning-status.mjs
 *
 * 天问实际 DEV 学习状态快照的中文说明工具。
 * 合同：docs/operations/learning-status-summary-contract.md
 *
 * stdin 一个 JSON 快照，stdout 一个 JSON 说明；退出码 0 表示有效，2 表示无效输入。
 *
 * 边界（与原合同一致）：
 * - 本工具是只读解释器，不是学习资格判定器；不重新判断任务、不修改反馈、
 *   不启动研究、不启用或回滚方法，也不写入任何学习记录。
 * - 研究来源“准备就绪/检查通过/隔离已解除”都不等于方法已启用或完整学习已完成。
 * - 只解释保存的状态；不因计数推断整体成功、发布 GO 或真实收益。
 * - 除 stdin 外不读取任何文件，不联网，不起子进程。
 * - 输入中的描述文本、skills、学习来源信息仅是不可信数据，不会当作指令执行。
 */

const SCHEMA_VERSION = 'tianwen.learning-status-summary.v1';

const INVALID_OUTPUT = '{"error":"invalid-learning-status"}';

const READINESS_SCOPE = '当前工作区的研究来源准备状态。';

const READINESS_EXPLANATIONS = new Map([
  ['analysis-disabled', '自动分析未开启或当前同意不适用，尚不能按当前规则准备研究。'],
  ['awaiting-compatible-sources', '尚未找到符合原规则的一组共同问题来源；普通任务成功不等于已经学会改进。'],
  ['awaiting-counterexample', '已有可配对的问题来源，尚缺符合原规则的成功对照。'],
  ['already-studied', '当前可配对来源已有研究记录；这不代表研究通过、方法启用或效果改善。'],
  ['already-attempted', '当前可配对来源已有案例设计尝试；这不代表设计完成或研究通过。'],
  ['ready-to-schedule', '当前来源可进入研究调度；研究尚未因此完成，方法也未因此启用。'],
  ['unavailable', '当前工作区的研究准备状态暂不可用，不能据此推断没有来源或已经完成学习。'],
]);

const UNKNOWN_READINESS_EXPLANATION =
  '当前研究准备状态暂无法识别；保留原值，不推断研究或启用结果。';

const ANALYSIS_ENABLED_TEXT = '自动分析已开启。';
const ANALYSIS_DISABLED_TEXT = '自动分析已关闭。';

const ACTIVATION_QUARANTINED_TEXT = '新方法启用仍受限制；这不会撤销历史启用记录。';
const ACTIVATION_CLEAR_TEXT = '当前未设置新方法启用隔离；这不代表其他启用条件已满足。';

const LIMITS = [
  '任务完成、检查通过和研究通过是不同状态，都不能单独证明完整自动学习已经完成。',
  '历史统计与当前工作区的准备状态范围不同，不能据此推断符合学习条件的来源数量。',
  '本报告只解释保存的状态，不重新判断任务、修改反馈、启动研究或启用方法。',
];

// 可选原来源诊断：只投影 currentSession.naturalConversation.guidanceReadiness.diagnostics。
// 这不是新的学习条件或资格裁决；不合格（缺失/畸形）时不增加诊断，也不影响旧基础报告。
const DIAGNOSTICS_SCHEMA_VERSION = 'tianwen.source-readiness-diagnostics.v1';

const DIAGNOSTICS_SCOPE = '当前工作区普通会话来源的原检查事实。';

// 严格两个字符串，按原顺序。
const DIAGNOSTICS_LIMITS = [
  '成功候选尚未证明与问题来源兼容。',
  '这里只是普通会话来源的检查事实，不代表原生Goal来源、研究裁决或方法效果。',
];

// 原扫描次序：这些排除是首个不满足条件，不代表全部问题。
const SOURCE_EXCLUSION_KEYS = [
  'consentRevision',
  'behaviorVersion',
  'qualityContract',
  'feedbackTurn',
  'family',
  'evaluationMode',
  'completion',
  'modelConfiguration',
  'fileMaterial',
];

const SOURCE_EXCLUSION_EXPLANATIONS = new Map([
  ['consentRevision', '同意版本与当前记录不一致。'],
  ['behaviorVersion', '行为协议版本与当前规则不一致。'],
  ['qualityContract', '缺少当前适用的质量合同。'],
  ['feedbackTurn', '本条是反馈回合，不是独立原任务。'],
  ['family', '任务类别不符合原来源规则。'],
  ['evaluationMode', '任务检查方式不符合原来源规则。'],
  ['completion', '原任务尚未正常完成。'],
  ['modelConfiguration', '原模型配置记录不可用。'],
  ['fileMaterial', '原文件材料不可恢复或输出类型不一致。'],
]);

const DIAGNOSTICS_COUNT_KEYS = [
  'observedTasks',
  'eligibleTasks',
  'problemSources',
  'successfulCandidates',
];

// 诊断对象恰好这 8 个自身键；exclusions 恰好 9 个自身键。
const DIAGNOSTICS_KEYS = [
  'schemaVersion',
  ...DIAGNOSTICS_COUNT_KEYS,
  'hasCompatibleProblemPair',
  'hasUnattemptedProblemPair',
  'exclusions',
];

// 声明计数字段：输出时只保留这些键，不复制 scope / 原因 / 元数据。
const REVIEW_KEYS = ['pending', 'unavailable', 'met', 'notMet', 'inconclusive'];
const CODE_CHECK_KEYS = ['prepared', 'pending', 'verified', 'rejected', 'unverifiable', 'invalidated'];
const FEEDBACK_ASSESSMENT_KEYS = [
  'total',
  'pending',
  'unavailable',
  'attributableProblems',
  'preferences',
  'positive',
  'requirementChanges',
  'inconclusive',
];
const GUIDANCE_STUDY_KEYS = [
  'total',
  'waiting',
  'stopped',
  'accepted',
  'rejected',
  'inconclusive',
  'currentlyActive',
  'rolledBack',
];

// 可选研究检查：只投影 history / currentSession 两侧 guidanceStudies 里的
// independentResults 与 activationPending 原计数。两范围互相独立；一侧缺失或畸形
// 只忽略该侧，不损坏旧报告，也不从顶层 quarantined 推算或覆盖计数。
const STUDY_CHECK_SCOPES = {
  history: '此Profile保存的历史研究；不等于当前会话任务或当前方法效果。',
  currentSession: '当前会话已观察任务涉及的研究范围；不只限于本会话发起的研究。',
};

// 严格 4 条，按原顺序，不增加条目。
const STUDY_CHECK_LIMITS = [
  '独立结果与模型裁决分开记录；满足已保存结果要求不等于语义安全、采用资格或完整学习成功。',
  'pendingArms是缺少已保存结果的实验臂数量，包含已停止研究；不表示仍在运行或已经成功。',
  '启用未完成原因计数可以重叠，不能相加；quarantined描述当前隔离设置，不追认历史原因。',
  'reasonUnestablished只是原因未确定，不是允许启用；未配置独立检查的历史不能宣称独立成功。',
];

// 仅原 8 字段，按原顺序。
const INDEPENDENT_RESULT_KEYS = [
  'configuredStudies',
  'unconfiguredStudies',
  'recordedArms',
  'pendingArms',
  'verified',
  'rejected',
  'unverifiable',
  'satisfiedStudies',
];

// 仅原 4 字段，按原顺序。
const ACTIVATION_PENDING_KEYS = [
  'total',
  'independentResultsNotSatisfied',
  'quarantined',
  'reasonUnestablished',
];

const MAX_STATE_CODE_UNITS = 128;

class InvalidLearningStatus extends Error {}

function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requireObject(value) {
  if (!isPlainObject(value)) throw new InvalidLearningStatus('object');
  return value;
}

function requireBoolean(value) {
  if (typeof value !== 'boolean') throw new InvalidLearningStatus('boolean');
  return value;
}

function requireCount(value) {
  // 字段缺失（undefined）不会被补 0，而是与类型不符一样判为无效。
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    throw new InvalidLearningStatus('count');
  }
  return value;
}

function requireState(value) {
  if (typeof value !== 'string' || value.length === 0 || value.length > MAX_STATE_CODE_UNITS) {
    throw new InvalidLearningStatus('state');
  }
  return value;
}

function pickCounts(source, keys) {
  const result = {};
  for (const key of keys) result[key] = requireCount(source[key]);
  return result;
}

function explainReadiness(state) {
  return READINESS_EXPLANATIONS.get(state) ?? UNKNOWN_READINESS_EXPLANATION;
}

// 恰好这些自身键：非 null、非数组、键数相等且每个键都存在（与 Runtime 原规则一致）。
function hasExactOwnKeys(value, keys) {
  return isPlainObject(value)
    && Reflect.ownKeys(value).length === keys.length
    && keys.every((key) => Object.hasOwn(value, key));
}

function isSourceCount(value) {
  return Number.isSafeInteger(value) && value >= 0;
}

/**
 * 纯投影：完整复刻 conversation-source-readiness.ts 的原检查规则。
 * 任何一项不合格都返回 undefined（不展示诊断），不抛错、不修复、不推断。
 */
function projectDiagnostics(value) {
  if (!hasExactOwnKeys(value, DIAGNOSTICS_KEYS)
    || value.schemaVersion !== DIAGNOSTICS_SCHEMA_VERSION
    || DIAGNOSTICS_COUNT_KEYS.some((key) => !isSourceCount(value[key]))
    || typeof value.hasCompatibleProblemPair !== 'boolean'
    || typeof value.hasUnattemptedProblemPair !== 'boolean'
    || !hasExactOwnKeys(value.exclusions, SOURCE_EXCLUSION_KEYS)) return undefined;

  const exclusions = value.exclusions;
  if (SOURCE_EXCLUSION_KEYS.some((key) => !isSourceCount(exclusions[key]))) return undefined;

  const observedTasks = value.observedTasks;
  const eligibleTasks = value.eligibleTasks;
  const problemSources = value.problemSources;
  const successfulCandidates = value.successfulCandidates;
  const excludedTotal = SOURCE_EXCLUSION_KEYS.reduce((sum, key) => sum + exclusions[key], 0);

  if (eligibleTasks > observedTasks
    || problemSources + successfulCandidates > eligibleTasks
    || excludedTotal !== observedTasks - eligibleTasks
    || (value.hasCompatibleProblemPair && problemSources < 2)
    || (value.hasUnattemptedProblemPair && !value.hasCompatibleProblemPair)) return undefined;

  return {
    scope: DIAGNOSTICS_SCOPE,
    observedTasks,
    eligibleTasks,
    problemSources,
    successfulCandidates,
    pairs: {
      compatible: value.hasCompatibleProblemPair,
      unattempted: value.hasUnattemptedProblemPair,
    },
    // 零计数也保留；不复制 schemaVersion/元数据或任意输入文本。
    exclusions: SOURCE_EXCLUSION_KEYS.map((key) => ({
      condition: key,
      count: exclusions[key],
      explanation: SOURCE_EXCLUSION_EXPLANATIONS.get(key),
    })),
    limits: [...DIAGNOSTICS_LIMITS],
  };
}

// ≥0 安全整数；缺失（undefined）与类型不符一样不合格，不补零、不转换类型。
function isStudyCount(value) {
  return Number.isSafeInteger(value) && value >= 0;
}

function pickStudyCounts(source, keys) {
  const result = {};
  for (const key of keys) result[key] = source[key];
  return result;
}

/**
 * 纯投影一侧可选研究检查。guidanceStudies 及两个子对象都须是非 null、非数组对象，
 * 12 个声明字段全部为 ≥0 安全整数；其他键忽略，不判计数间关系、不把重叠计数相加。
 * 任一不合格返回 undefined（整侧忽略），不抛错、不修复、不推断。
 */
function projectStudyCheck(studies, scope) {
  if (!isPlainObject(studies)) return undefined;
  const independentResults = studies.independentResults;
  const activationPending = studies.activationPending;
  if (!isPlainObject(independentResults) || !isPlainObject(activationPending)) return undefined;
  if (INDEPENDENT_RESULT_KEYS.some((key) => !isStudyCount(independentResults[key]))) return undefined;
  if (ACTIVATION_PENDING_KEYS.some((key) => !isStudyCount(activationPending[key]))) return undefined;
  return {
    scope,
    independentResults: pickStudyCounts(independentResults, INDEPENDENT_RESULT_KEYS),
    activationPending: pickStudyCounts(activationPending, ACTIVATION_PENDING_KEYS),
    limits: [...STUDY_CHECK_LIMITS],
  };
}

function buildSummary(snapshot) {
  const root = requireObject(snapshot);

  const consent = requireObject(root.consent);
  const conversationGuidanceActivation = requireObject(root.conversationGuidanceActivation);
  const currentSession = requireObject(root.currentSession);
  const sessionNaturalConversation = requireObject(currentSession.naturalConversation);
  const guidanceReadiness = requireObject(sessionNaturalConversation.guidanceReadiness);

  const history = requireObject(root.history);
  const historyNaturalConversation = requireObject(history.naturalConversation);
  const completion = requireObject(historyNaturalConversation.completion);
  const reviews = requireObject(historyNaturalConversation.reviews);
  const codeChecks = requireObject(historyNaturalConversation.codeChecks);
  const feedbackAssessments = requireObject(historyNaturalConversation.feedbackAssessments);
  const guidanceStudies = requireObject(historyNaturalConversation.guidanceStudies);

  const analysisEnabled = requireBoolean(consent.enabled);
  const quarantined = requireBoolean(conversationGuidanceActivation.quarantined);
  const state = requireState(guidanceReadiness.state);

  const observedTurns = requireCount(historyNaturalConversation.observedTurns);
  const identifiedTasks = requireCount(historyNaturalConversation.identifiedTasks);
  const completed = requireCount(completion.completed);

  const readiness = {
    state,
    scope: READINESS_SCOPE,
    explanation: explainReadiness(state),
  };

  // analysis-disabled 时与原 SDK 一致不展示该诊断；其他合法 state（含未知）不因诊断改 state/explanation。
  if (state !== 'analysis-disabled') {
    const diagnostics = projectDiagnostics(guidanceReadiness.diagnostics);
    if (diagnostics) readiness.diagnostics = diagnostics;
  }

  // 可选研究检查：两个范围互相独立；一侧缺失或畸形只忽略该侧，均无效则不新增顶层键。
  // 分析关闭时仍可显示合法的历史保存事实；不从顶层 quarantined 推算或覆盖原计数。
  const studyChecks = {};
  const historyStudyCheck = projectStudyCheck(
    historyNaturalConversation.guidanceStudies,
    STUDY_CHECK_SCOPES.history,
  );
  if (historyStudyCheck !== undefined) studyChecks.history = historyStudyCheck;
  const currentSessionStudyCheck = projectStudyCheck(
    sessionNaturalConversation.guidanceStudies,
    STUDY_CHECK_SCOPES.currentSession,
  );
  if (currentSessionStudyCheck !== undefined) studyChecks.currentSession = currentSessionStudyCheck;

  return {
    schemaVersion: SCHEMA_VERSION,
    analysis: analysisEnabled ? ANALYSIS_ENABLED_TEXT : ANALYSIS_DISABLED_TEXT,
    activation: quarantined ? ACTIVATION_QUARANTINED_TEXT : ACTIVATION_CLEAR_TEXT,
    readiness,
    history: {
      observedTurns,
      identifiedTasks,
      completed,
      reviews: pickCounts(reviews, REVIEW_KEYS),
      codeChecks: pickCounts(codeChecks, CODE_CHECK_KEYS),
      feedbackAssessments: pickCounts(feedbackAssessments, FEEDBACK_ASSESSMENT_KEYS),
      // 旧 history.studies 仍只保留原 8 基础计数，不加新子对象、不改范围。
      studies: pickCounts(guidanceStudies, GUIDANCE_STUDY_KEYS),
    },
    // studyChecks 为空对象时不产生任何键。
    ...studyChecks,
    limits: [...LIMITS],
  };
}

function emitInvalid() {
  process.stdout.write(`${INVALID_OUTPUT}\n`);
  process.exitCode = 2;
}

async function readStdin() {
  process.stdin.setEncoding('utf8');
  let raw = '';
  for await (const chunk of process.stdin) raw += chunk;
  return raw;
}

async function main() {
  let raw;
  try {
    raw = await readStdin();
  } catch {
    emitInvalid();
    return;
  }

  let snapshot;
  try {
    snapshot = JSON.parse(raw);
  } catch {
    emitInvalid();
    return;
  }

  let summary;
  try {
    summary = buildSummary(snapshot);
  } catch {
    // 字段缺失 / 类型不符 / 计数非法一律按无效输入处理，stderr 保持为空。
    emitInvalid();
    return;
  }

  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
  process.exitCode = 0;
}

main().catch(() => {
  emitInvalid();
});
