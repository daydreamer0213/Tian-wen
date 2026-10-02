import { isAbsolute, resolve } from 'node:path'

import { parseConversationFileEntries } from '@tianwen/evolution'

/**
 * 纯 DEV 文件权限投影。
 *
 * 复用 Evolution 既有 @tianwen/evolution 裸包的 parseConversationFileEntries
 * 校验合并后的声明路径；不复制解析器、不安装依赖、不自行寻找工作区包。
 */

/** 与 Evolution 原单文件捕获边界一致：96 KiB。 */
const MAX_TARGET_BYTES_CEILING = 96 * 1024

const ALLOWED_TOOLS = new Set(['read', 'write', 'edit'])

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function requireNonEmptyString(value, label) {
  if (typeof value !== 'string' || value.length === 0) {
    throw new TypeError(`${label} must be a non-empty string`)
  }
  return value
}

function requirePathList(value, label, allowEmpty) {
  if (!Array.isArray(value) || (allowEmpty !== true && value.length === 0)) {
    throw new TypeError(`${label} must be ${allowEmpty === true ? 'an array' : 'a non-empty array'}`)
  }
  return value.map((item, index) => {
    if (typeof item !== 'string') throw new TypeError(`${label}[${index}] must be a string`)
    return item
  })
}

function byteLength(value) {
  return Buffer.byteLength(value, 'utf8')
}

/** Windows 身份忽略大小写；其他平台保留大小写。 */
function identity(path) {
  return process.platform === 'win32' ? path.toLowerCase() : path
}

/** 统计字面 needle 在 haystack 中实际不重叠匹配数。 */
function countOccurrences(haystack, needle) {
  let count = 0
  let cursor = 0
  for (;;) {
    const at = haystack.indexOf(needle, cursor)
    if (at === -1) return count
    count += 1
    cursor = at + needle.length
  }
}

export function createDevelopmentNativeFilePolicy(config, readCurrentContent) {
  if (!isPlainObject(config)) throw new TypeError('development native file policy config must be a plain object')
  const cwd = config.cwd
  if (typeof cwd !== 'string' || !isAbsolute(cwd)) throw new TypeError('development native cwd must be an absolute path')
  const sessionId = requireNonEmptyString(config.sessionId, 'development native sessionId')
  const maxTargetBytes = config.maxTargetBytes
  if (!Number.isSafeInteger(maxTargetBytes) || maxTargetBytes < 1 || maxTargetBytes > MAX_TARGET_BYTES_CEILING) {
    throw new TypeError('development native maxTargetBytes must be a positive safe integer within the capture boundary')
  }
  if (typeof readCurrentContent !== 'function') throw new TypeError('development native readCurrentContent must be a function')
  const outputPaths = requirePathList(config.outputPaths, 'development native outputPaths', false)
  const referencePaths = config.referencePaths === undefined
    ? []
    : requirePathList(config.referencePaths, 'development native referencePaths', true)

  // 原 Evolution 入口校验合并后的声明路径：唯一、无大小写别名、无歧义或保留名。
  parseConversationFileEntries([
    ...outputPaths.map(path => ({ path, content: null })),
    ...referencePaths.map(path => ({ path, content: null })),
  ])

  // 克隆并冻结声明状态，之后调用者修改原数组/配置不能扩大权限。
  const resolvedOutputs = Object.freeze(outputPaths.map(path => resolve(cwd, path)))
  const resolvedReferences = Object.freeze(referencePaths.map(path => resolve(cwd, path)))
  const outputSet = new Set(resolvedOutputs.map(identity))
  const declaredSet = new Set([...resolvedOutputs, ...resolvedReferences].map(identity))
  const policy = Object.freeze({
    cwd,
    sessionId,
    maxTargetBytes,
    outputPaths: resolvedOutputs,
    referencePaths: resolvedReferences,
    outputSet,
    declaredSet,
  })

  return function guard(execution) {
    if (!isPlainObject(execution)) return 'development native execution must be a plain object'
    const name = execution.name
    if (typeof name !== 'string' || !ALLOWED_TOOLS.has(name)) return 'development native tool is not declared'
    if (execution.sessionId !== policy.sessionId) return 'development native operation does not belong to the owning session'
    if (execution.parent !== undefined) return 'development native subagent operations are not permitted'
    if (typeof execution.callId !== 'string' || execution.callId.length === 0) return 'development native callId must be a non-empty string'
    if (typeof execution.rootCallId !== 'string' || execution.rootCallId.length === 0) return 'development native rootCallId must be a non-empty string'
    if (execution.callId !== execution.rootCallId) return 'development native operation is not a native root call'
    const args = execution.arguments
    if (!isPlainObject(args)) return 'development native arguments must be a plain object'
    const filePath = args.file_path
    if (typeof filePath !== 'string') return 'development native file_path must be a string'

    const absolute = resolve(policy.cwd, filePath)
    const permitted = name === 'read' ? policy.declaredSet : policy.outputSet
    if (!permitted.has(identity(absolute))) return 'development native path is not declared for this operation'

    if (name === 'read') return undefined

    if (name === 'write') {
      const content = args.content
      if (typeof content !== 'string') return 'development native write content must be a string'
      if (byteLength(content) > policy.maxTargetBytes) return 'development native write content exceeds the target byte budget'
      return undefined
    }

    // edit：形状校验通过后，才对合法声明输出读取一次当前内容。
    const oldString = args.old_string
    const newString = args.new_string
    const replaceAll = args.replace_all
    if (typeof oldString !== 'string' || oldString.length === 0) return 'development native edit old_string must be a non-empty string'
    if (typeof newString !== 'string') return 'development native edit new_string must be a string'
    if (replaceAll !== undefined && typeof replaceAll !== 'boolean') return 'development native edit replace_all must be a boolean'

    let current
    try {
      current = readCurrentContent(absolute)
    } catch {
      return 'development native edit cannot read the current target content'
    }
    if (typeof current !== 'string') return 'development native edit target content is unavailable'
    if (byteLength(current) > policy.maxTargetBytes) return 'development native edit target content exceeds the target byte budget'

    const occurrences = countOccurrences(current, oldString)
    if (occurrences === 0) return 'development native edit old_string is absent from the target content'
    if (replaceAll !== true && occurrences !== 1) return 'development native edit old_string is ambiguous without replace_all'

    // 字面串替换：绝不解释 $&、$`、$' 或 $$；split/join 只命中实际不重叠匹配。
    const next = current.split(oldString).join(newString)
    if (byteLength(next) > policy.maxTargetBytes) return 'development native edit result exceeds the target byte budget'
    return undefined
  }
}
