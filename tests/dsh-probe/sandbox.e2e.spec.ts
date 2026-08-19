import { spawn } from 'node:child_process'
import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs'
import { join, resolve } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import type {
  ConfinedArgv,
  RunnerFailureRule,
} from '@deepseek-ai/dsh-sandbox'
import { LocalSandboxProvider } from '@deepseek-ai/dsh-sandbox-local'
import { SessionId } from '@deepseek-ai/dsh-session'
import { describe, expect, it } from 'vitest'

const runSandbox = process.env.TIANWEN_RUN_DSH_SANDBOX === '1'
const describeSandbox = runSandbox ? describe : describe.skip

const PROBE_ROOT = resolve('D:/DevData/tianwen-dsh-probe')
const SANDBOX_ROOT = join(PROBE_ROOT, 'sandbox')
const REPORT_PATH = join(PROBE_ROOT, 'sandbox-report.json')
const DENIAL_PREFIX = 'TIANWEN_SANDBOX_WRITE_DENIED '
const WRITE_SCRIPT = `
  const { writeFileSync, writeSync } = require("node:fs")
  try {
    writeFileSync(process.argv[1], "probe")
  } catch (error) {
    writeSync(
      2,
      ${JSON.stringify(DENIAL_PREFIX)}
      + JSON.stringify({
        code: error.code,
        message: error.message,
        syscall: error.syscall,
        path: error.path,
      })
      + "\\n",
    )
    process.exit(73)
  }
`
const PROCESS_TIMEOUT_MS = 15_000

interface ProcessResult {
  readonly exitCode: number | null
  readonly stderr: string
  readonly stdout: string
}

interface FailureClassification {
  readonly denial: boolean
  readonly denialEvidence:
    | 'provider-denial-dialect'
    | 'structured-child-fs-error'
    | null
  readonly providerDenialDialectMatched: boolean
  readonly runnerFailure: boolean
}

interface StructuredWriteError {
  readonly code: 'EPERM' | 'EACCES' | 'EROFS'
  readonly message: string
  readonly path: string
  readonly syscall: 'open'
}

interface StructuredDenialTarget {
  readonly expectedPath: string
  readonly targetExists: boolean
}

function matchesRunnerFailure(
  exitCode: number | null,
  stderr: string,
  rules: readonly RunnerFailureRule[],
): boolean {
  if (exitCode === null || exitCode === 0) return false
  const lines = stderr.split(/\r?\n/u).filter(line => line.length > 0)

  return rules.some((rule) => {
    if (
      rule.allowedExitCodes !== undefined
      && !rule.allowedExitCodes.includes(exitCode)
    ) {
      return false
    }

    const informationalLines = new Set(
      (rule.informationalLines ?? []).map(line => line.toLowerCase()),
    )
    return lines
      .filter(line => !informationalLines.has(line.toLowerCase()))
      .some(line => rule.fatalSignatures.some(
        signature => line.toLowerCase().includes(signature.toLowerCase()),
      ))
  })
}

function parseStructuredWriteError(stderr: string): StructuredWriteError | null {
  if (stderr.split(DENIAL_PREFIX).length !== 2) return null
  const line = stderr
    .split(/\r?\n/u)
    .find(candidate => candidate.startsWith(DENIAL_PREFIX))
  if (line === undefined) return null

  let value: unknown
  try {
    value = JSON.parse(line.slice(DENIAL_PREFIX.length))
  } catch {
    return null
  }
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return null
  }

  const record = value as Record<string, unknown>
  if (
    record.code !== 'EPERM'
    && record.code !== 'EACCES'
    && record.code !== 'EROFS'
  ) {
    return null
  }
  if (
    typeof record.message !== 'string'
    || typeof record.path !== 'string'
    || record.syscall !== 'open'
  ) {
    return null
  }
  return {
    code: record.code,
    message: record.message,
    path: record.path,
    syscall: record.syscall,
  }
}

function classifyFailure(
  result: ProcessResult,
  confined: ConfinedArgv,
  structuredTarget?: StructuredDenialTarget,
): FailureClassification {
  const runnerFailure = matchesRunnerFailure(
    result.exitCode,
    result.stderr,
    confined.runnerFailureRules,
  )
  const stderrLines = result.stderr
    .split(/\r?\n/u)
    .map(line => line.toLowerCase())
  const providerDenialDialectMatched = !runnerFailure && stderrLines.some(
    line => confined.denialSignatures.some(
      signature => line.includes(signature.toLowerCase()),
    ),
  )
  const structuredWriteError = !runnerFailure && result.exitCode === 73
    ? parseStructuredWriteError(result.stderr)
    : null
  const structuredChildFsError = structuredTarget !== undefined
    && !structuredTarget.targetExists
    && structuredWriteError?.path === structuredTarget.expectedPath
  const targetAbsent = structuredTarget === undefined
    || !structuredTarget.targetExists
  const denialEvidence = !targetAbsent || runnerFailure
    ? null
    : providerDenialDialectMatched
      ? 'provider-denial-dialect'
      : structuredChildFsError
        ? 'structured-child-fs-error'
        : null

  return {
    runnerFailure,
    denial: denialEvidence !== null,
    denialEvidence,
    providerDenialDialectMatched,
  }
}

function minimalEnvironment(tempRoot: string): NodeJS.ProcessEnv {
  const systemRoot = process.env.SystemRoot ?? process.env.WINDIR
  if (systemRoot === undefined) {
    throw new Error('SystemRoot is required for the Windows sandbox gate')
  }
  return {
    SystemRoot: systemRoot,
    TEMP: tempRoot,
    TMP: tempRoot,
    WINDIR: systemRoot,
  }
}

function runConfined(
  confined: ConfinedArgv,
  cwd: string,
  env: NodeJS.ProcessEnv,
): Promise<ProcessResult> {
  const program = confined.argv[0]
  if (program === undefined) {
    throw new Error('sandbox provider returned an empty argv')
  }

  return new Promise((resolveResult, reject) => {
    const child = spawn(program, confined.argv.slice(1), {
      cwd,
      env,
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let stderr = ''
    let stdout = ''
    let timedOut = false
    child.stderr.setEncoding('utf8')
    child.stdout.setEncoding('utf8')
    child.stderr.on('data', chunk => {
      stderr += chunk
    })
    child.stdout.on('data', chunk => {
      stdout += chunk
    })

    const timer = setTimeout(() => {
      timedOut = true
      child.kill()
    }, PROCESS_TIMEOUT_MS)

    child.once('error', (error) => {
      clearTimeout(timer)
      reject(error)
    })
    child.once('close', (exitCode) => {
      clearTimeout(timer)
      if (timedOut) {
        reject(new Error(`confined process exceeded ${PROCESS_TIMEOUT_MS}ms`))
        return
      }
      resolveResult({ exitCode, stderr, stdout })
    })
  })
}

function restoreEnvironment(
  name: 'TEMP' | 'TMP',
  previous: string | undefined,
): void {
  if (previous === undefined) delete process.env[name]
  else process.env[name] = previous
}

function assertCanonicalDirectory(path: string): void {
  const entry = lstatSync(path)
  const expected = resolve(path).toLowerCase()
  const actual = resolve(realpathSync.native(path)).toLowerCase()
  if (!entry.isDirectory() || actual !== expected) {
    throw new Error(`${path} must be a canonical directory`)
  }
}

function ensureSandboxRoot(): void {
  assertCanonicalDirectory(PROBE_ROOT)
  if (existsSync(SANDBOX_ROOT)) assertCanonicalDirectory(SANDBOX_ROOT)
  else mkdirSync(SANDBOX_ROOT)
  assertCanonicalDirectory(SANDBOX_ROOT)
}

describeSandbox('real DSH local sandbox', () => {
  it('accepts only an exact structured child filesystem denial', () => {
    const targetPath = 'D:\\DevData\\tianwen-dsh-probe\\sandbox\\target.txt'
    const denialPrefix = 'TIANWEN_SANDBOX_WRITE_DENIED '
    const confined: ConfinedArgv = {
      argv: [],
      enforcement: 'partial',
      denialSignatures: ['permission denied'],
      runnerFailureRules: [{
        allowedExitCodes: [127],
        fatalSignatures: ['windows-acl-run: '],
      }],
    }
    const record = (overrides: Record<string, unknown> = {}): string =>
      `${denialPrefix}${JSON.stringify({
        code: 'EPERM',
        message: 'operation not permitted',
        syscall: 'open',
        path: targetPath,
        ...overrides,
      })}\n`
    const classify = (
      result: ProcessResult,
      targetExists = false,
      confinedArgv = confined,
    ) => classifyFailure(
      result,
      confinedArgv,
      { expectedPath: targetPath, targetExists },
    )

    expect(classify({
      exitCode: 73,
      stderr: record(),
      stdout: '',
    })).toMatchObject({
      denial: true,
      denialEvidence: 'structured-child-fs-error',
      providerDenialDialectMatched: false,
      runnerFailure: false,
    })

    const rejected: ReadonlyArray<{
      readonly confinedArgv?: ConfinedArgv
      readonly name: string
      readonly result: ProcessResult
      readonly targetExists?: boolean
    }> = [
      {
        name: 'exit code other than 73',
        result: { exitCode: 1, stderr: record(), stdout: '' },
      },
      {
        name: 'missing prefix',
        result: {
          exitCode: 73,
          stderr: record().slice(denialPrefix.length),
          stdout: '',
        },
      },
      {
        name: 'duplicated prefix',
        result: {
          exitCode: 73,
          stderr: `${record()}${record()}`,
          stdout: '',
        },
      },
      {
        name: 'malformed JSON',
        result: {
          exitCode: 73,
          stderr: `${denialPrefix}{broken\n`,
          stdout: '',
        },
      },
      {
        name: 'unknown filesystem code',
        result: {
          exitCode: 73,
          stderr: record({ code: 'ENOENT' }),
          stdout: '',
        },
      },
      {
        name: 'syscall other than open',
        result: {
          exitCode: 73,
          stderr: record({ syscall: 'write' }),
          stdout: '',
        },
      },
      {
        name: 'different target path',
        result: {
          exitCode: 73,
          stderr: record({ path: `${targetPath}.other` }),
          stdout: '',
        },
      },
      {
        name: 'runner failure',
        result: {
          exitCode: 73,
          stderr: `windows-acl-run: failed\n${record()}`,
          stdout: '',
        },
        confinedArgv: {
          ...confined,
          runnerFailureRules: [{
            allowedExitCodes: [73],
            fatalSignatures: ['windows-acl-run: '],
          }],
        },
      },
      {
        name: 'target file exists',
        result: { exitCode: 73, stderr: record(), stdout: '' },
        targetExists: true,
      },
    ]

    for (const testCase of rejected) {
      expect(
        classify(
          testCase.result,
          testCase.targetExists ?? false,
          testCase.confinedArgv ?? confined,
        ).denial,
        testCase.name,
      ).toBe(false)
    }
  })

  it('rejects a reparse-point sandbox directory', () => {
    if (process.platform !== 'win32') {
      throw new Error('Task 8 is restricted to the controlled Windows D drive')
    }
    ensureSandboxRoot()

    const disposableRoot = mkdtempSync(join(SANDBOX_ROOT, 'path-check-'))
    const target = join(disposableRoot, 'target')
    const junction = join(disposableRoot, 'junction')
    try {
      mkdirSync(target)
      symlinkSync(target, junction, 'junction')
      expect(() => assertCanonicalDirectory(junction))
        .toThrow(/canonical directory/u)
    } finally {
      if (existsSync(junction)) unlinkSync(junction)
      rmSync(disposableRoot, { recursive: true, force: true })
    }
  })

  it('enforces workspace modes and reports the outside-root boundary honestly', async () => {
    if (process.platform !== 'win32') {
      throw new Error('Task 8 is restricted to the controlled Windows D drive')
    }
    ensureSandboxRoot()
    rmSync(REPORT_PATH, { force: true })

    const configuredRoot = process.env.TIANWEN_DSH_PROBE_ROOT
    if (
      configuredRoot === undefined
      || resolve(configuredRoot).toLowerCase() !== PROBE_ROOT.toLowerCase()
    ) {
      throw new Error(`TIANWEN_DSH_PROBE_ROOT must be exactly ${PROBE_ROOT}`)
    }

    const previousTemp = process.env.TEMP
    const previousTmp = process.env.TMP
    let ctx: Context | undefined
    let disposableRoot: string | undefined
    let primaryError: unknown
    const cleanupErrors: unknown[] = []

    try {
      disposableRoot = mkdtempSync(join(SANDBOX_ROOT, 'task-8-'))
      const workspaceRoot = join(disposableRoot, 'workspace')
      const privateTempRoot = join(disposableRoot, 'temp')
      const readOnlyTarget = join(workspaceRoot, 'read-only.txt')
      const workspaceWriteTarget = join(workspaceRoot, 'workspace-write.txt')
      const siblingTarget = join(disposableRoot, 'sibling-write.txt')
      mkdirSync(workspaceRoot)
      mkdirSync(privateTempRoot)
      process.env.TEMP = privateTempRoot
      process.env.TMP = privateTempRoot
      ctx = new Context()
      await ctx.plugin(LocalSandboxProvider, {})
      const env = minimalEnvironment(privateTempRoot)
      const readOnly = ctx.sandbox.confine(
        [process.execPath, '-e', WRITE_SCRIPT, readOnlyTarget],
        {
          mode: 'read-only',
          workspaceRoot,
          sessionId: SessionId('sandbox-read-only'),
        },
      )
      const readOnlyResult = await runConfined(readOnly, workspaceRoot, env)
      const readOnlyTargetExists = existsSync(readOnlyTarget)
      const readOnlyFailure = classifyFailure(
        readOnlyResult,
        readOnly,
        {
          expectedPath: readOnlyTarget,
          targetExists: readOnlyTargetExists,
        },
      )
      const readOnlyEvidence = JSON.stringify({
        result: readOnlyResult,
        denialSignatures: readOnly.denialSignatures,
        runnerFailureRules: readOnly.runnerFailureRules,
      })

      const workspaceWrite = ctx.sandbox.confine(
        [process.execPath, '-e', WRITE_SCRIPT, workspaceWriteTarget],
        {
          mode: 'workspace-write',
          workspaceRoot,
          sessionId: SessionId('sandbox-workspace-write'),
        },
      )
      const workspaceWriteResult = await runConfined(
        workspaceWrite,
        workspaceRoot,
        env,
      )
      expect(classifyFailure(workspaceWriteResult, workspaceWrite).runnerFailure)
        .toBe(false)
      expect(workspaceWriteResult.exitCode).toBe(0)
      expect(readFileSync(workspaceWriteTarget, 'utf8')).toBe('probe')
      expect(workspaceWrite.enforcement).toBe(readOnly.enforcement)

      if (process.platform === 'win32') {
        expect(readOnly.enforcement).toBe('partial')
      }

      const siblingWrite = ctx.sandbox.confine(
        [process.execPath, '-e', WRITE_SCRIPT, siblingTarget],
        {
          mode: 'workspace-write',
          workspaceRoot,
          sessionId: SessionId('sandbox-sibling-write'),
        },
      )
      const siblingWriteResult = await runConfined(
        siblingWrite,
        workspaceRoot,
        env,
      )
      const siblingTargetExists = existsSync(siblingTarget)
      const siblingFailure = classifyFailure(
        siblingWriteResult,
        siblingWrite,
        {
          expectedPath: siblingTarget,
          targetExists: siblingTargetExists,
        },
      )
      expect(siblingFailure.runnerFailure).toBe(false)
      expect(siblingWrite.enforcement).toBe(readOnly.enforcement)

      let outsideRootProtection: 'denied' | 'not-proven'
      if (readOnly.enforcement === 'full') {
        expect(siblingWriteResult.exitCode).not.toBeNull()
        expect(siblingWriteResult.exitCode).not.toBe(0)
        expect(siblingFailure.denial).toBe(true)
        expect(siblingTargetExists).toBe(false)
        outsideRootProtection = 'denied'
      } else {
        outsideRootProtection = 'not-proven'
      }

      const readOnlyDenied = readOnlyResult.exitCode !== null
        && readOnlyResult.exitCode !== 0
        && !readOnlyFailure.runnerFailure
        && readOnlyFailure.denial
        && !readOnlyTargetExists
      writeFileSync(REPORT_PATH, `${JSON.stringify({
        schemaVersion: 'tianwen.dsh_sandbox_probe.v1',
        platform: process.platform,
        provider: '@deepseek-ai/dsh-sandbox-local@0.1.0-rc.7',
        enforcement: readOnly.enforcement,
        readOnlyWorkspaceWrite: readOnlyDenied ? 'denied' : 'not-proven',
        readOnlyDenialEvidence: readOnlyDenied
          ? readOnlyFailure.denialEvidence
          : null,
        providerDenialDialectMatched:
          readOnlyFailure.providerDenialDialectMatched,
        workspaceWriteInsideRoot: 'allowed',
        outsideRootProtection,
        highRiskRecommendation: 'use-container-remote-or-microvm',
      }, null, 2)}\n`, 'utf8')

      expect(readOnlyResult.exitCode).not.toBeNull()
      expect(readOnlyResult.exitCode).not.toBe(0)
      expect(readOnlyFailure.runnerFailure).toBe(false)
      expect(readOnlyFailure.denial, readOnlyEvidence).toBe(true)
      expect(readOnlyTargetExists).toBe(false)
    } catch (error) {
      primaryError = error
    } finally {
      if (ctx !== undefined) {
        try {
          await ctx.fiber.dispose()
        } catch (error) {
          cleanupErrors.push(error)
        }
      }
      try {
        restoreEnvironment('TEMP', previousTemp)
        restoreEnvironment('TMP', previousTmp)
      } catch (error) {
        cleanupErrors.push(error)
      }
      if (disposableRoot !== undefined) {
        try {
          rmSync(disposableRoot, { recursive: true, force: true })
        } catch (error) {
          cleanupErrors.push(error)
        }
      }
    }

    if (primaryError !== undefined) throw primaryError
    if (cleanupErrors.length > 0) {
      throw new AggregateError(cleanupErrors, 'sandbox cleanup failed')
    }
  }, 60_000)
})
