import { expect, it } from 'vitest'
import { canonicalJsonResult, validateIsolatedPythonContainer, isolatedPythonPolicy } from '../../scripts/isolated-python-cli.js'

it.each([
  ['{"n":9007199254740993,"a":[true,null,"中"]}', '{"a":[true,null,"中"],"n":9007199254740993}'],
  ['{"n":1.2500e+2}', '{"n":125}'], ['-0.000e999', '0'], ['1e999', '10e998'],
  ['"\\u0061"', '"a"'], ['{"\\u0061":1}', '{"a":1}'],
])('compares complete JSON values losslessly (%s)', (left, right) => {
  expect(canonicalJsonResult(left)).toBe(canonicalJsonResult(right))
})
it.each([
  ['9007199254740993', '9007199254740992'], ['0.123456789123456789', '0.123456789123456788'],
  ['{"n":1}', '"{n:1}"'], ['[]', '{}'], ['"1"', '1'], ['[1,2]', '[2,1]'],
])('does not round or conflate different JSON values (%s)', (left, right) => {
  expect(canonicalJsonResult(left)).not.toBe(canonicalJsonResult(right))
})
it.each(['{"a":1,"a":2}', '{"a":1,"\\u0061":1}', '{"n":{"a":1,"a":1}}',
  'NaN', '01', '+1', '1.', '1e', 'true false', '[1,]', '{"a":1,}', '"unterminated',
  '['.repeat(65) + '0' + ']'.repeat(65), '"' + 'a'.repeat(32769) + '"'])('rejects ambiguous or unbounded JSON (%s)', text => {
  expect(() => canonicalJsonResult(text)).toThrow()
})

function container() {
  return {
    Id: 'a'.repeat(64), Name: '/tianwen-cli-test', Image: 'sha256:' + 'b'.repeat(64), Mounts: [],
    Config: { User: '65532:65532', OpenStdin: true, Tty: false, WorkingDir: '/tmp', Entrypoint: null, Cmd: ['python3', '-I', '-S', '-B', '-c', 'print(1)'],
      Labels: { 'tianwen.isolated-cli': 'c'.repeat(64) }, Env: ['PATH=/usr/local/bin:/usr/bin', 'HOME=/tmp', 'TMPDIR=/tmp', 'PYTHONDONTWRITEBYTECODE=1'] },
    HostConfig: { NetworkMode: 'none', ReadonlyRootfs: true, Privileged: false, Memory: 134217728, MemorySwap: 134217728,
      NanoCpus: 500000000, PidsLimit: 32, CapDrop: ['ALL'], CapAdd: null, SecurityOpt: ['no-new-privileges'],
      Binds: null, Devices: [], DeviceRequests: null, PidMode: '', IpcMode: 'private', AutoRemove: false, RestartPolicy: { Name: 'no' },
      Tmpfs: { '/tmp': 'rw,nosuid,nodev,noexec,size=16777216' },
      LogConfig: { Type: 'local', Config: { 'max-size': '64k', 'max-file': '1', compress: 'false' } } },
  }
}
const identity = { name: 'tianwen-cli-test', label: 'c'.repeat(64), imageId: 'sha256:' + 'b'.repeat(64), source: 'print(1)' }
it.each(['AutoRemove', 'RestartPolicy'] as const)('rejects missing %s metadata rather than assuming defaults', field => {
  const value = container()
  Reflect.deleteProperty(value.HostConfig, field)
  expect(() => validateIsolatedPythonContainer(value, identity)).toThrow()
})
it('accepts only the inspected frozen isolation boundary', () => {
  expect(() => validateIsolatedPythonContainer(container(), identity)).not.toThrow()
  expect(isolatedPythonPolicy).toMatchObject({ sourceBytes: 20480, ioBytes: 32768, maxTimeoutMs: 20000 })
})
it.each(['network', 'writable', 'root', 'mount', 'privileged', 'cpu', 'swap', 'pids', 'capability', 'source', 'image', 'label', 'env', 'pid', 'device'] as const)('rejects an altered %s boundary before execution', field => {
  const value = container()
  if (field === 'network') value.HostConfig.NetworkMode = 'host'
  if (field === 'writable') value.HostConfig.ReadonlyRootfs = false
  if (field === 'root') value.Config.User = '0'
  if (field === 'mount') (value.Mounts as unknown[]).push({ Source: 'D:/DevData' })
  if (field === 'privileged') value.HostConfig.Privileged = true
  if (field === 'cpu') value.HostConfig.NanoCpus = 0
  if (field === 'swap') value.HostConfig.MemorySwap = -1
  if (field === 'pids') value.HostConfig.PidsLimit = 0
  if (field === 'capability') value.HostConfig.CapDrop = []
  if (field === 'source') value.Config.Cmd[5] = 'other source'
  if (field === 'image') value.Image = 'sha256:' + 'd'.repeat(64)
  if (field === 'label') value.Config.Labels['tianwen.isolated-cli'] = 'wrong'
  if (field === 'env') value.Config.Env.push('SECRET=unexpected')
  if (field === 'pid') value.HostConfig.PidMode = 'host'
  if (field === 'device') (value.HostConfig.Devices as unknown[]).push({ PathOnHost: '/dev/sda' })
  expect(() => validateIsolatedPythonContainer(value, identity)).toThrow()
})
