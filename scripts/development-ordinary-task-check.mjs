/**
 * 持续开发环境的普通任务合同分派（纯模块，无文件读写/SDK 依赖）。
 *
 * createDevelopmentOrdinaryTaskCheck(configOrArray, createCheck) 在构造时深拷贝全部
 * 普通任务合同，并为每份合同各调用一次 createCheck；返回的检查对象按 material.request
 * 的文本块精确匹配一份合同 requestText，再把完全同一个 material 交给对应的原 prepare。
 */

const TEXT_BLOCK_TYPE = 'text'
const TEXT_BLOCK_JOIN = '\n'

function isObjectLike(value) {
  return typeof value === 'object' && value !== null
}

function isContractObject(value) {
  return isObjectLike(value) && !Array.isArray(value)
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.length > 0
}

function isNonBlankString(value) {
  return typeof value === 'string' && value.trim() !== ''
}

/**
 * 按原公共工厂文本规则投影 material.request：
 * 依序取所有消息 content 中 type === 'text' 的块的 text，用换行拼接。
 * 结构无效或 text 非字符串时返回 undefined（不 trim、不忽略大小写、不做任何模糊匹配）。
 */
function projectRequestText(material) {
  if (!isObjectLike(material)) return undefined
  const { request } = material
  if (!Array.isArray(request)) return undefined

  const textBlocks = []
  for (const message of request) {
    if (!isObjectLike(message)) return undefined
    const { content } = message
    if (!Array.isArray(content)) return undefined
    for (const block of content) {
      if (!isObjectLike(block)) return undefined
      if (block.type !== TEXT_BLOCK_TYPE) continue
      if (typeof block.text !== 'string') return undefined
      textBlocks.push(block.text)
    }
  }
  return textBlocks.join(TEXT_BLOCK_JOIN)
}

export function createDevelopmentOrdinaryTaskCheck(configOrArray, createCheck) {
  if (typeof createCheck !== 'function') {
    throw new TypeError('createCheck must be a function')
  }

  const submitted = Array.isArray(configOrArray) ? [...configOrArray] : [configOrArray]
  if (submitted.length === 0) {
    throw new TypeError('configOrArray must provide at least one ordinary task contract')
  }

  let sharedCwd
  let hasSharedCwd = false
  const seenRequestTexts = new Set()
  for (const contract of submitted) {
    if (!isContractObject(contract)) {
      throw new TypeError('each ordinary task contract must be an object')
    }
    if (!isNonEmptyString(contract.cwd)) {
      throw new TypeError('contract.cwd must be a non-empty string')
    }
    if (!isNonBlankString(contract.requestText)) {
      throw new TypeError('contract.requestText must be a non-empty, non-blank string')
    }
    if (!hasSharedCwd) {
      sharedCwd = contract.cwd
      hasSharedCwd = true
    } else if (contract.cwd !== sharedCwd) {
      throw new TypeError('all ordinary task contracts must share the same cwd')
    }
    if (seenRequestTexts.has(contract.requestText)) {
      throw new TypeError('contract.requestText values must be distinct')
    }
    seenRequestTexts.add(contract.requestText)
  }

  // 深拷贝调用方合同，之后调用方的任何改动都不影响冻结配置与选择。
  const frozenContracts = submitted.map(contract => structuredClone(contract))

  // 每份冻结合同各调用一次 createCheck，之后再校验返回对象。
  const createdChecks = frozenContracts.map(contract => createCheck(contract))
  const routeByRequestText = new Map()
  for (let index = 0; index < frozenContracts.length; index += 1) {
    const check = createdChecks[index]
    if (!isObjectLike(check) || typeof check.prepare !== 'function') {
      throw new TypeError('createCheck must return an object with a prepare function')
    }
    routeByRequestText.set(frozenContracts[index].requestText, check)
  }

  return {
    async prepare(material) {
      const requestText = projectRequestText(material)
      if (requestText === undefined) return undefined
      const check = routeByRequestText.get(requestText)
      if (check === undefined) return undefined
      // 同一个 material 直接交给原 prepare：返回对象保持同一性，异常/拒绝原样向上抛出。
      return check.prepare(material)
    },
  }
}
