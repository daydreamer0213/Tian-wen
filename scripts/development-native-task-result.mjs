/**
 * 纯 DEV 原结果投影。
 *
 * 只读已验证的 Evolution 原状态与期望输出路径，返回恰好六字段；
 * 不修改输入或历史、不产生完整任务成功/反馈/研究/采用/学习收益判定。
 */

function requireExpectedOutputPaths(expectedOutputPaths) {
  if (!Array.isArray(expectedOutputPaths) || expectedOutputPaths.length === 0) {
    throw new TypeError('expectedOutputPaths must be a non-empty array')
  }
  const expected = new Set()
  for (let index = 0; index < expectedOutputPaths.length; index += 1) {
    const path = expectedOutputPaths[index]
    if (typeof path !== 'string') throw new TypeError(`expectedOutputPaths[${index}] must be a string`)
    // 重复必须在去重前拒绝，而不是静默接受。
    if (expected.has(path)) throw new TypeError('expectedOutputPaths must be unique')
    expected.add(path)
  }
  return expected
}

/** 原 completion.files.outputPaths 必须是完整唯一、与期望逐字同集合；反序合法。 */
function exactOutputSet(outputPaths, expected) {
  if (!Array.isArray(outputPaths) || outputPaths.length !== expected.size) return false
  const actual = new Set()
  for (const path of outputPaths) {
    if (typeof path !== 'string' || actual.has(path)) return false
    actual.add(path)
  }
  for (const path of expected) {
    if (!actual.has(path)) return false
  }
  return true
}

export function summarizeDevelopmentNativeTask(task, expectedOutputPaths) {
  const expected = requireExpectedOutputPaths(expectedOutputPaths)

  const source = task?.source
  const completion = task?.completion
  const finished = task?.externalCheckFinished
  const review = task?.review

  const completionStatus = completion?.status ?? null
  const functionalStatus = finished?.status ?? null
  const permissionSetExact = exactOutputSet(completion?.files?.outputPaths, expected)

  // 只由已完成、有准备、程序 verified、externalCheckInvalidated 未定义且权限精确共同支撑；
  // 不借模型 met/inconclusive 或缺准备/核验推断。
  const functionalCandidateVerified = completionStatus === 'completed'
    && task?.externalCheckPrepared != null
    && functionalStatus === 'verified'
    && task?.externalCheckInvalidated === undefined
    && permissionSetExact

  return {
    taskId: source?.taskId ?? null,
    completionStatus,
    functionalStatus,
    reviewVerdict: review?.verdict ?? null,
    permissionSetExact,
    functionalCandidateVerified,
  }
}
