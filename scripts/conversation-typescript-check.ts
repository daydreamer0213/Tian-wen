import { existsSync, readFileSync, realpathSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'
import { sha256, supportsConversationCodeCheck } from '../packages/tianwen-evolution/src/index.js'
import type { ConversationExternalCodeCheck, ConversationExternalCodePreparation } from '../packages/tianwen-runtime-bundle/src/conversation-external-check.js'

const CHECKER_ID = 'conversation-typescript-noemit'
const CHECKER_PATH = fileURLToPath(import.meta.url)
// TypeScript accepts ignore/expect-error prefixes without a word boundary,
// including closing lines of block comments without a leading star.
const SUPPRESSION = /^\s*[/*]*\s*@ts-(ignore|expect-error|nocheck\b)/gmu

export interface ConversationTypeScriptCheckConfig {
  readonly cwd: string
  readonly requestText: string
  readonly targetPath: string
  readonly contextPaths: readonly string[]
  readonly compilerOptions: ts.CompilerOptions
}

/** Trusted project constraint over the already-frozen compiler program. */
export interface FrozenTypeScriptCandidateConstraint {
  readonly digest: ReturnType<typeof sha256>
  readonly check: (program: ts.Program, target: ts.SourceFile) => string | undefined
}

interface Observations {
  readonly texts: Map<string, string | undefined>
  readonly files: Map<string, boolean>
  readonly directories: Map<string, boolean>
  readonly children: Map<string, readonly string[]>
  readonly realPaths: Map<string, string>
}

const pathKey = (path: string): string => {
  const key = resolve(path).replaceAll('\\', '/')
  return process.platform === 'win32' ? key.toLowerCase() : key
}
const samePath = (left: string, right: string): boolean => pathKey(left) === pathKey(right)

function inside(root: string, candidate: string): string | undefined {
  if (candidate.length === 0 || isAbsolute(candidate)) return undefined
  const full = resolve(root, candidate)
  const rel = relative(root, full)
  if (rel.length === 0 || rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel)) return undefined
  // Resolve the nearest existing ancestor also for a genuinely absent target.
  let ancestor = full
  try {
    while (!existsSync(ancestor)) ancestor = dirname(ancestor)
    const realRel = relative(realpathSync(root), realpathSync(ancestor))
    if (realRel === '..' || realRel.startsWith(`..${sep}`) || isAbsolute(realRel)) return undefined
  } catch { return undefined }
  return full
}

const directRequestText = (request: ConversationExternalCodePreparation['request']): string =>
  request.flatMap(message => message.content.flatMap(block => block.type === 'text' ? [block.text] : [])).join('\n')

function compareKeys(left: readonly [string, unknown], right: readonly [string, unknown]): number {
  return left[0] < right[0] ? -1 : left[0] > right[0] ? 1 : 0
}

function describe(scope: string, diagnostics: readonly ts.Diagnostic[]): string {
  const codes = [...new Set(diagnostics.map(diagnostic => diagnostic.code))].sort((left, right) => left - right)
  return `Frozen TypeScript strict noEmit check only, not whole-task quality, ${scope}: ${diagnostics.length} diagnostic(s)${codes.length === 0 ? '' : `; codes ${codes.join(',')}`}`
}

function suppressionCounts(text: string, fileName: string): Map<string, number> {
  const counts = new Map<string, number>()
  // Parse first so templates/regular expressions cannot swallow real comments
  // or present literal contents as comments in a context-free scanner.
  const source = ts.createSourceFile(fileName, text, ts.ScriptTarget.ES2024)
  const pending: ts.Node[] = [source]
  const seen = new Set<number>()
  while (pending.length > 0) {
    const node = pending.pop()!
    const position = node.getFullStart()
    const comments = [...(ts.getLeadingCommentRanges(text, position) ?? []), ...(ts.getTrailingCommentRanges(text, position) ?? [])]
    for (const comment of comments) {
      if (seen.has(comment.pos)) continue
      seen.add(comment.pos)
      for (const match of text.slice(comment.pos, comment.end).matchAll(SUPPRESSION)) {
        const directive = match[1]
        if (directive !== undefined) counts.set(directive, (counts.get(directive) ?? 0) + 1)
      }
    }
    pending.push(...node.getChildren(source))
  }
  return counts
}

function addsSuppression(candidate: string, original: string, fileName: string): boolean {
  const before = suppressionCounts(original, fileName)
  for (const [directive, count] of suppressionCounts(candidate, fileName)) {
    if (count > (before.get(directive) ?? 0)) return true
  }
  return false
}

function captureHost(options: ts.CompilerOptions, cwd: string, targetKey: string, observations: Observations): ts.CompilerHost {
  const host = ts.createCompilerHost(options, true)
  const readFile = host.readFile
  const fileExists = host.fileExists
  const directoryExists: (path: string) => boolean = host.directoryExists ?? (() => false)
  const getDirectories: (path: string) => readonly string[] = host.getDirectories ?? (() => [])
  const realpath: (path: string) => string = host.realpath ?? ((path: string) => path)
  host.getCurrentDirectory = () => cwd
  host.readFile = (path) => {
    const key = pathKey(path)
    if (!observations.texts.has(key)) observations.texts.set(key, readFile(path))
    const text = observations.texts.get(key)
    return key === targetKey && text === undefined ? '' : text
  }
  host.fileExists = (path) => {
    const key = pathKey(path)
    if (!observations.files.has(key)) observations.files.set(key, fileExists(path))
    return key === targetKey ? true : observations.files.get(key) === true
  }
  host.directoryExists = (path) => {
    const key = pathKey(path)
    if (!observations.directories.has(key)) observations.directories.set(key, directoryExists(path))
    return observations.directories.get(key) === true
  }
  host.getDirectories = (path) => {
    const key = pathKey(path)
    if (!observations.children.has(key)) observations.children.set(key, [...getDirectories(path)])
    return [...(observations.children.get(key) ?? [])]
  }
  host.realpath = (path) => {
    const key = pathKey(path)
    if (!observations.realPaths.has(key)) observations.realPaths.set(key, realpath(path))
    return observations.realPaths.get(key) ?? path
  }
  host.writeFile = () => { throw new Error('frozen TypeScript check must not emit') }
  return host
}

export function createConversationTypeScriptCheck(config: ConversationTypeScriptCheckConfig, constraint?: FrozenTypeScriptCandidateConstraint): ConversationExternalCodeCheck {
  const frozenConstraint = constraint === undefined ? undefined : { digest: constraint.digest, check: constraint.check }
  if (frozenConstraint !== undefined && (!/^sha256:[a-f0-9]{64}$/u.test(frozenConstraint.digest) || typeof frozenConstraint.check !== 'function')) throw new Error('invalid frozen TypeScript candidate constraint')
  const cwd = resolve(config.cwd)
  const requestText = config.requestText
  const targetPath = config.targetPath
  const contextPaths = [...config.contextPaths]
  const options: ts.CompilerOptions = { ...structuredClone(config.compilerOptions),
    strict: true, noEmit: true, noCheck: false,
    noImplicitAny: true, noImplicitThis: true, alwaysStrict: true, strictNullChecks: true,
    strictFunctionTypes: true, strictBindCallApply: true, strictPropertyInitialization: true,
    strictBuiltinIteratorReturn: true, useUnknownInCatchVariables: true,
  }
  const requireFromHere = createRequire(import.meta.url)
  const compilerDigest = sha256(readFileSync(requireFromHere.resolve('typescript'), 'utf8'))
  const checkerDigest = sha256(readFileSync(CHECKER_PATH, 'utf8'))

  return {
    async prepare(material) {
      material.signal.throwIfAborted()
      if (!samePath(material.cwd, cwd)) return undefined
      if (directRequestText(material.request) !== requestText) return undefined
      if (!supportsConversationCodeCheck(material.task.admission?.decision)) return undefined
      const targetFull = inside(cwd, targetPath)
      if (targetFull === undefined) return undefined
      const contextFulls: string[] = []
      for (const path of contextPaths) {
        const full = inside(cwd, path)
        if (full === undefined) return undefined
        contextFulls.push(full)
      }
      const observations: Observations = { texts: new Map(), files: new Map(), directories: new Map(), children: new Map(), realPaths: new Map() }
      const targetKey = pathKey(targetFull)
      const host = captureHost(options, cwd, targetKey, observations)
      const baseline = ts.createProgram([targetFull, ...contextFulls], options, host)
      ts.getPreEmitDiagnostics(baseline)
      material.signal.throwIfAborted()
      const originalContent = observations.texts.get(targetKey) ?? null
      const manifest = [...observations.texts].map(([path, text]) => ({ path, digest: text === undefined ? null : sha256(text) }))
        .sort((left, right) => left.path < right.path ? -1 : left.path > right.path ? 1 : 0)
      const contractDigest = sha256({
        cwd, targetPath, contextPaths, requestText,
        compiler: ts.version, options, compilerDigest, checkerDigest,
        ...(frozenConstraint === undefined ? {} : { constraintDigest: frozenConstraint.digest }),
        manifest,
        files: [...observations.files].sort(compareKeys),
        directories: [...observations.directories].sort(compareKeys),
        children: [...observations.children].sort(compareKeys),
        realPaths: [...observations.realPaths].sort(compareKeys),
      })
      const scope = targetPath

      return {
        checkerId: CHECKER_ID,
        checkerDigest,
        contractDigest,
        inputs: [{ path: targetPath, content: originalContent }],
        evaluate: async (candidate) => {
          candidate.signal.throwIfAborted()
          const input = candidate.inputs.length === 1 ? candidate.inputs[0] : undefined
          if (input === undefined || input.path !== targetPath || input.content !== originalContent) {
            return { status: 'unverifiable', detail: `${describe(scope, [])}; original target input mismatch` }
          }
          const output = candidate.outputs.length === 1 ? candidate.outputs[0] : undefined
          const outputPath = candidate.outputPaths.length === 1 ? candidate.outputPaths[0] : undefined
          if (output === undefined || outputPath !== targetPath || output.path !== targetPath || typeof output.content !== 'string') {
            return { status: 'unverifiable', detail: `${describe(scope, [])}; candidate output binding mismatch` }
          }
          const candidateText = output.content
          if (addsSuppression(candidateText, originalContent ?? '', targetPath)) {
            return { status: 'rejected', detail: `${describe(scope, [])}; codes suppression-directive` }
          }
          let unknown = false
          const observed = (key: string): boolean => observations.texts.has(key) || observations.files.has(key)
            || observations.directories.has(key) || observations.children.has(key) || observations.realPaths.has(key)
          const frozen = ts.createCompilerHost(options, true)
          frozen.getCurrentDirectory = () => cwd
          frozen.readFile = (path) => {
            const key = pathKey(path)
            if (key === targetKey) return candidateText
            if (!observed(key)) unknown = true
            return observations.texts.get(key)
          }
          frozen.fileExists = (path) => {
            const key = pathKey(path)
            if (key === targetKey) return true
            if (!observed(key)) unknown = true
            return observations.texts.get(key) !== undefined || observations.files.get(key) === true
          }
          frozen.directoryExists = (path) => {
            const key = pathKey(path)
            if (!observed(key)) unknown = true
            return observations.directories.get(key) === true
          }
          frozen.getDirectories = (path) => {
            const key = pathKey(path)
            if (!observed(key)) unknown = true
            return [...(observations.children.get(key) ?? [])]
          }
          frozen.realpath = (path) => {
            const key = pathKey(path)
            if (!observed(key)) unknown = true
            return observations.realPaths.get(key) ?? path
          }
          frozen.readDirectory = () => []
          frozen.writeFile = () => { throw new Error('frozen TypeScript check must not emit') }
          const program = ts.createProgram([targetFull, ...contextFulls], options, frozen)
          candidate.signal.throwIfAborted()
          const diagnostics = ts.getPreEmitDiagnostics(program)
          candidate.signal.throwIfAborted()
          if (unknown) return { status: 'unverifiable', detail: `${describe(scope, diagnostics)}; required dependency outside frozen context` }
          if (diagnostics.length === 0) {
            if (frozenConstraint !== undefined) {
              const target = program.getSourceFile(targetFull)
              if (target === undefined) return { status: 'unverifiable', detail: `${describe(scope, diagnostics)}; frozen candidate source unavailable` }
              const violation = frozenConstraint.check(program, target)
              candidate.signal.throwIfAborted()
              if (violation !== undefined) return { status: 'rejected', detail: `${describe(scope, diagnostics)}; ${violation}` }
            }
            return { status: 'verified', detail: describe(scope, diagnostics) }
          }
          return { status: 'rejected', detail: describe(scope, diagnostics) }
        },
      }
    },
  }
}
