import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const target = fileURLToPath(new URL('./summarize-learning-status.mjs', import.meta.url));
function snapshot() {
  return {
    consent: { enabled: true },
    conversationGuidanceActivation: { quarantined: true },
    currentSession: { naturalConversation: { guidanceReadiness: { state: 'awaiting-compatible-sources' } } },
    history: { naturalConversation: {
      observedTurns: 15, identifiedTasks: 14, completion: { completed: 14 },
      reviews: { pending: 0, unavailable: 6, met: 7, notMet: 0, inconclusive: 2 },
      codeChecks: { prepared: 12, pending: 0, verified: 7, rejected: 2, unverifiable: 3, invalidated: 1 },
      feedbackAssessments: { total: 0, pending: 0, unavailable: 0, attributableProblems: 0,
        preferences: 0, positive: 0, requirementChanges: 0, inconclusive: 0 },
      guidanceStudies: { total: 0, waiting: 0, stopped: 0, accepted: 0, rejected: 0,
        inconclusive: 0, currentlyActive: 0, rolledBack: 0 },
    } },
  };
}
function run(input) {
  const result = spawnSync(process.execPath, [target], { input: JSON.stringify(input), encoding: 'utf8', timeout: 5000 });
  assert.equal(result.error, undefined);
  assert.equal(result.signal, null);
  assert.equal(result.stderr, '');
  return { status: result.status, value: JSON.parse(result.stdout) };
}

test('registered status nesting preserves completed tasks and distinct historical counts', () => {
  const input = snapshot(), result = run(input), source = input.history.naturalConversation;
  assert.equal(result.status, 0);
  assert.deepEqual(result.value.history, {
    observedTurns: 15, identifiedTasks: 14, completed: 14,
    reviews: source.reviews, codeChecks: source.codeChecks,
    feedbackAssessments: source.feedbackAssessments, studies: source.guidanceStudies,
  });
  assert.equal(result.value.readiness.state, 'awaiting-compatible-sources');
});

test('unrelated history metadata cannot override the declared nested fields', () => {
  const input = snapshot();
  Object.assign(input.history, structuredClone(input.history.naturalConversation));
  input.history.completion.completed = 999;
  input.history.reviews.met = 999;
  const result = run(input);
  assert.equal(result.status, 0);
  assert.equal(result.value.history.completed, 14);
  assert.equal(result.value.history.reviews.met, 7);
});

test('root-level lookalikes cannot fill a missing nested required field', () => {
  const input = snapshot();
  input.history.completion = input.history.naturalConversation.completion;
  delete input.history.naturalConversation.completion;
  assert.deepEqual(run(input), { status: 2, value: { error: 'invalid-learning-status' } });
});

test('unknown readiness remains data and cannot imply activation', () => {
  const input = snapshot();
  input.currentSession.naturalConversation.guidanceReadiness.state = '__proto__';
  input.conversationGuidanceActivation.quarantined = false;
  const result = run(input);
  assert.equal(result.status, 0);
  assert.equal(result.value.readiness.state, '__proto__');
  assert.equal(result.value.readiness.explanation, '当前研究准备状态暂无法识别；保留原值，不推断研究或启用结果。');
  assert.equal(result.value.activation, '当前未设置新方法启用隔离；这不代表其他启用条件已满足。');
});
