import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, realpathSync, rmSync } from 'node:fs'
import { resolve, sep } from 'node:path'
import { expect, it } from 'vitest'

it('keeps the frozen exact-path functional suite passing on the actual host platform', () => {
  const base = 'D:/DevData/tianwen-path-identity-native-20261003/host-tests'
  mkdirSync(base, { recursive: true })
  const root = mkdtempSync(resolve(base, 'paths-'))
  try {
    const stdout = execFileSync(process.execPath, ['--import', 'tsx', 'tests/fixtures/exact-path-identity/entry.mjs'], {
      cwd: process.cwd(), encoding: 'utf8', windowsHide: true,
      env: { ...process.env, TIANWEN_PATH_TEST_ROOT: root }, timeout: 15_000,
    })
    expect(stdout).toBe('{"passed":true}\n')
  } finally {
    const owned = realpathSync(root), parent = realpathSync(base)
    if (!owned.startsWith(parent + sep)) throw new Error('Path test ownership mismatch')
    rmSync(owned, { recursive: true })
  }
})
