import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it } from 'vitest'
import { TianwenNativeToolObservationService, parseNativeDirectoryReceipt } from '../../packages/tianwen-runtime-bundle/src/native-tool-observation.js'
import { sha256 } from '../../packages/tianwen-evolution/src/learning-intake.js'

function fixture() {
  const command = 'Get-Location', nonce = '11111111-1111-4111-8111-111111111111', home = 'D:\\PowerShell'
  const digest = sha256(command)
  return {
    schemaVersion: 'tianwen.native-pwsh-directory.v1', identity, command, commandDigest: digest,
    cwd: 'E:\\workspace', workspaceRoot: 'E:\\workspace', interpreter: { path: `${home}\\pwsh.exe`, version: '7.6.5' },
    executionSettingsDigest: sha256({}), qualification: { parser: 'System.Management.Automation.Language.Parser', commandDigest: digest, commands: [{ name: command, arguments: [] }] },
    processId: 123, nonce, nativeResultDigest: sha256({}),
    frames: [
      ['start', nonce, '123', `${home}\\pwsh.exe`, '7.6.5','FullLanguage','E:\\workspace','FileSystem','Microsoft.PowerShell.Commands.FileSystemProvider',`${home}\\System.Management.Automation.dll`,'task','session','call',digest],
      ['lookup',nonce,'123',command,'Cmdlet',command,'Microsoft.PowerShell.Management',`${home}\\Modules\\Microsoft.PowerShell.Management\\Microsoft.PowerShell.Management.psd1`,'Microsoft.PowerShell.Commands.GetLocationCommand',`${home}\\Microsoft.PowerShell.Commands.Management.dll`,'E:\\workspace','FileSystem'],
      ['terminal',nonce,'123','PowerShell.Exiting','PowerShell.Exiting'],
    ],
  }
}

const identity = { taskId: 'task', sessionId: 'session', callId: 'call' }
describe('native observation scope', () => {
  it('preserves caller errors and releases capture', async () => {
    const service = new TianwenNativeToolObservationService(new Context())
    const error = new Error('caller failure')
    await expect(service.capture(identity, async () => { throw error })).rejects.toBe(error)
    expect(service.current()).toBeUndefined()
  })
  it('isolates concurrent identities and never certifies no execution', async () => {
    const service = new TianwenNativeToolObservationService(new Context())
    const values = await Promise.all(['a', 'b'].map(callId => service.capture({ ...identity, callId }, async () => {
      await new Promise(resolve => setTimeout(resolve, 2))
      return service.current()?.identity.callId
    })))
    expect(values).toEqual([{ result: 'a' }, { result: 'b' }])
    expect(service.current()).toBeUndefined()
  })
  it('rejects incomplete and unknown receipt shapes', () => {
    expect(() => parseNativeDirectoryReceipt({ safe: true })).toThrow()
    expect(() => parseNativeDirectoryReceipt(null)).toThrow()
  })
  it('accepts a complete bounded receipt and autoload lookup duplicates', () => {
    const receipt = fixture()
    receipt.frames.splice(1,0,[...receipt.frames[1]!])
    expect(parseNativeDirectoryReceipt(receipt).processId).toBe(123)
  })
  it.each([
    ['missing terminal', (r: ReturnType<typeof fixture>) => r.frames.pop()],
    ['duplicate terminal', (r: ReturnType<typeof fixture>) => r.frames.push([...r.frames[2]!])],
    ['wrong nonce', (r: ReturnType<typeof fixture>) => r.frames[1]![1] = 'wrong'],
    ['wrong PID', (r: ReturnType<typeof fixture>) => r.frames[1]![2] = '124'],
    ['wrong call', (r: ReturnType<typeof fixture>) => r.identity = { ...identity, callId: 'other' }],
    ['wrong digest', (r: ReturnType<typeof fixture>) => r.commandDigest = sha256('other')],
    ['shadow function', (r: ReturnType<typeof fixture>) => r.frames[1]![4] = 'Function'],
    ['wrong implementation', (r: ReturnType<typeof fixture>) => r.frames[1]![8] = 'Other.Type'],
    ['missing lookup', (r: ReturnType<typeof fixture>) => r.frames.splice(1,1)],
    ['unknown lookup', (r: ReturnType<typeof fixture>) => r.frames[1]![3] = 'Get-Content'],
    ['outside provider', (r: ReturnType<typeof fixture>) => r.frames[1]![11] = 'Registry'],
    ['outside location', (r: ReturnType<typeof fixture>) => r.frames[1]![10] = 'C:\\outside'],
    ['too many frames', (r: ReturnType<typeof fixture>) => r.frames.splice(1,0,...Array.from({length:64},()=>[...r.frames[1]!]))],
    ['too many wire bytes', (r: ReturnType<typeof fixture>) => r.frames[1]![7] = 'x'.repeat(65536)],
    ['unsafe option', (r: ReturnType<typeof fixture>) => (r.qualification.commands[0]!.arguments as unknown[]).push({kind:'parameter',value:'OutFile'})],
    ['unknown field', (r: ReturnType<typeof fixture>) => Object.assign(r,{safe:true})],
  ])('rejects %s', (_name, mutate) => {
    const receipt = fixture(); mutate(receipt)
    expect(() => parseNativeDirectoryReceipt(receipt)).toThrow()
  })
  it('invalidates a scope after multiple runs or mismatched identity', async () => {
    const service = new TianwenNativeToolObservationService(new Context())
    const result = await service.capture(identity, async () => {
      const scope = service.begin()!
      service.record(scope, parseNativeDirectoryReceipt(fixture()))
      service.begin()
      service.record(scope, parseNativeDirectoryReceipt(fixture()))
      return 'native output'
    })
    expect(result).toEqual({result:'native output'})
  })
})
