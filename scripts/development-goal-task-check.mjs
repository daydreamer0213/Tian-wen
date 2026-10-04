/**
 * 持续开发环境的原生 Goal Task 合同分派（纯模块，无文件读写/SDK 依赖）。
 *
 * createDevelopmentGoalTaskCheck(configOrArray, createCheck) 在构造时校验并深拷贝全部
 * 原生 Goal Task 合同，再为每份冻结合同各调用一次原同步 createCheck 工厂，保留其收到的
 * 全部原字段。返回的选择器按 material.task.objective 的字符串逐字匹配一份合同
 * requestText，再把完全同一个 material 交给对应原方法，保留原 this 绑定、返回对象同一性、
 * undefined、原错误与取消。
 *
 * 这里刻意不复用普通任务的 material.request 文本块投影：原生 Task 的委托要求只在
 * task.objective 上，不从 goal.objective、request、context 等字段推断。
 * 原公开 Goal 工厂仍负责核验 Goal 命令来源、cwd、权限、Task、epoch、模型与文件合同。
 */

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
 * 只读取非数组 material 的非数组 task 中的字符串 objective，逐字返回。
 * 结构无效或 objective 非字符串时返回 undefined（不改大小写、不去空白、不模糊匹配）。
 */
function projectObjective(material) {
  if (!isContractObject(material)) return undefined
  const { task } = material
  if (!isContractObject(task)) return undefined
  const { objective } = task
  if (typeof objective !== 'string') return undefined
  return objective
}

export function createDevelopmentGoalTaskCheck(configOrArray, createCheck) {
  if (typeof createCheck !== 'function') {
    throw new TypeError('createCheck must be a function')
  }

  const submitted = Array.isArray(configOrArray) ? [...configOrArray] : [configOrArray]
  if (submitted.length === 0) {
    throw new TypeError('configOrArray must provide at least one goal task contract')
  }

  // 先检查全部合同，全部通过后才进入深拷贝。
  let sharedCwd
  let hasSharedCwd = false
  let sharedGoalCommand
  let hasSharedGoalCommand = false
  const seenRequestTexts = new Set()
  for (const contract of submitted) {
    if (!isContractObject(contract)) {
      throw new TypeError('each goal task contract must be an object')
    }
    if (!isNonEmptyString(contract.cwd)) {
      throw new TypeError('contract.cwd must be a non-empty string')
    }
    if (!isNonBlankString(contract.goalCommand)) {
      throw new TypeError('contract.goalCommand must be a non-empty, non-blank string')
    }
    if (!isNonBlankString(contract.requestText)) {
      throw new TypeError('contract.requestText must be a non-empty, non-blank string')
    }
    if (!hasSharedCwd) {
      sharedCwd = contract.cwd
      hasSharedCwd = true
    } else if (contract.cwd !== sharedCwd) {
      throw new TypeError('all goal task contracts must share the same cwd')
    }
    if (!hasSharedGoalCommand) {
      sharedGoalCommand = contract.goalCommand
      hasSharedGoalCommand = true
    } else if (contract.goalCommand !== sharedGoalCommand) {
      throw new TypeError('all goal task contracts must share the same goalCommand')
    }
    if (seenRequestTexts.has(contract.requestText)) {
      throw new TypeError('contract.requestText values must be distinct')
    }
    seenRequestTexts.add(contract.requestText)
  }

  // 深拷贝调用方合同：之后调用方改字段、嵌套值或数组顺序都不影响选择与原工厂配置。
  const frozenContracts = submitted.map(contract => structuredClone(contract))

  // 每份冻结合同带全部原字段各交给原同步工厂一次，随后再校验返回接口。
  const createdChecks = frozenContracts.map(contract => createCheck(contract))
  const routeByObjective = new Map()
  for (let index = 0; index < frozenContracts.length; index += 1) {
    const check = createdChecks[index]
    if (!isContractObject(check) || typeof check.prepare !== 'function') {
      throw new TypeError('createCheck must return an object with a prepare function')
    }
    if (check.methodScope !== undefined && typeof check.methodScope !== 'function') {
      throw new TypeError('check.methodScope must be a function when present')
    }
    routeByObjective.set(frozenContracts[index].requestText, check)
  }

  return {
    async methodScope(material) {
      const check = routeByObjective.get(projectObjective(material))
      // 没有 methodScope 的合同仍可正常 prepare，这里只返回 undefined。
      if (check === undefined || typeof check.methodScope !== 'function') return undefined
      // 同一个 material 以原 this 交给原方法：返回身份与异常原样保留。
      return check.methodScope(material)
    },
    async prepare(material) {
      const check = routeByObjective.get(projectObjective(material))
      if (check === undefined) return undefined
      return check.prepare(material)
    },
  }
}
