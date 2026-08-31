import { describe, expect, it } from 'vitest'
import { chromiumLocale, desktopCopy, desktopLocale } from '../../packages/tianwen-desktop-host/src/locale.js'

describe('Tianwen Desktop locale', () => {
  it.each([
    ['zh-CN', 'zh'],
    ['zh-Hans-CN', 'zh'],
    ['en-US', 'en'],
    ['ja-JP', 'en'],
  ] as const)('maps system locale %s to %s', (system, expected) => {
    expect(desktopLocale(system)).toBe(expected)
  })

  it('uses a Chinese Chromium locale only for the Chinese product locale', () => {
    expect(chromiumLocale('zh')).toBe('zh-CN')
    expect(chromiumLocale('en')).toBe('en')
  })

  it('keeps native copy in one selected language', () => {
    expect(desktopCopy('zh').selectNodeTitle).toBe('选择 Node 可执行文件')
    expect(desktopCopy('en').selectNodeTitle).toBe('Select Node executable')
  })

  it('explains the one-time embedded Runtime update in the selected language', () => {
    expect(desktopCopy('zh')).toMatchObject({
      updateRuntimeTitle: '更新 Tianwen Runtime？',
      updateRuntimeInstruction: expect.stringMatching(/0\.1\.7.*0\.1\.8/u),
      updateRuntimeAction: '更新 Runtime',
    })
    expect(desktopCopy('en')).toMatchObject({
      updateRuntimeTitle: 'Update the Tianwen Runtime?',
      updateRuntimeInstruction: expect.stringMatching(/0\.1\.7.*0\.1\.8/u),
      updateRuntimeAction: 'Update Runtime',
    })
  })
})
