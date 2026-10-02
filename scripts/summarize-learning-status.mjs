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

  return {
    schemaVersion: SCHEMA_VERSION,
    analysis: analysisEnabled ? ANALYSIS_ENABLED_TEXT : ANALYSIS_DISABLED_TEXT,
    activation: quarantined ? ACTIVATION_QUARANTINED_TEXT : ACTIVATION_CLEAR_TEXT,
    readiness: {
      state,
      scope: READINESS_SCOPE,
      explanation: explainReadiness(state),
    },
    history: {
      observedTurns,
      identifiedTasks,
      completed,
      reviews: pickCounts(reviews, REVIEW_KEYS),
      codeChecks: pickCounts(codeChecks, CODE_CHECK_KEYS),
      feedbackAssessments: pickCounts(feedbackAssessments, FEEDBACK_ASSESSMENT_KEYS),
      studies: pickCounts(guidanceStudies, GUIDANCE_STUDY_KEYS),
    },
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
