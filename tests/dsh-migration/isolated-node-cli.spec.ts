import { expect, it } from 'vitest'
import { validateIsolatedNodeContainer, isolatedNodePolicy } from '../../packages/tianwen-runtime-bundle/src/isolated-node-cli.js'
const identity = { name: 'tianwen-cli-test', label: 'c'.repeat(64), imageId: 'sha256:' + 'b'.repeat(64), source: 'console.log(1)' }
function container(language: 'javascript' | 'typescript') {
  return { Id: 'a'.repeat(64), Name: '/tianwen-cli-test', Image: identity.imageId, Mounts: [],
    Config: { User: '65532:65532', OpenStdin: true, Tty: false, WorkingDir: '/tmp', Entrypoint: ['node'],
      Cmd: [language === 'typescript' ? '--input-type=module-typescript' : '--input-type=module', '--eval', identity.source],
      Labels: { 'tianwen.isolated-cli': identity.label }, Env: ['PATH=/usr/local/bin:/usr/bin', 'NODE_VERSION=22.23.1', 'YARN_VERSION=1.22.22', 'HOME=/tmp', 'TMPDIR=/tmp'] },
    HostConfig: { NetworkMode: 'none', ReadonlyRootfs: true, Privileged: false, Memory: isolatedNodePolicy.memory as number, MemorySwap: isolatedNodePolicy.memory,
      NanoCpus: isolatedNodePolicy.cpu, PidsLimit: isolatedNodePolicy.pids, CapDrop: ['ALL'], CapAdd: null, SecurityOpt: ['no-new-privileges'],
      Binds: null, Devices: [], DeviceRequests: null, PidMode: '', IpcMode: 'private', AutoRemove: false, RestartPolicy: { Name: 'no' },
      Tmpfs: { '/tmp': isolatedNodePolicy.tmpfs }, LogConfig: { Type: 'local', Config: { 'max-size': '64k', 'max-file': '1', compress: 'false' } } } }
}
it.each(['javascript', 'typescript'] as const)('requires fixed %s execution and rejects mode substitution', language => {
  expect(() => validateIsolatedNodeContainer(container(language), identity, language)).not.toThrow()
  expect(() => validateIsolatedNodeContainer(container(language), identity, language === 'javascript' ? 'typescript' : 'javascript')).toThrow()
})
it.each(['entrypoint', 'command', 'environment', 'network', 'mount', 'identity', 'memory', 'restart'] as const)('rejects Node %s boundary substitution', field => {
  const row = container('javascript')
  if (field === 'entrypoint') row.Config.Entrypoint = ['sh']
  if (field === 'command') row.Config.Cmd.push('--require=untrusted')
  if (field === 'environment') row.Config.Env.push('NODE_OPTIONS=--require=untrusted')
  if (field === 'network') row.HostConfig.NetworkMode = 'host'
  if (field === 'mount') (row.Mounts as unknown[]).push({ Source: 'D:/DevData' })
  if (field === 'identity') row.Config.Labels['tianwen.isolated-cli'] = 'wrong'
  if (field === 'memory') row.HostConfig.Memory = 0
  if (field === 'restart') Reflect.deleteProperty(row.HostConfig, 'RestartPolicy')
  expect(() => validateIsolatedNodeContainer(row, identity, 'javascript')).toThrow()
})
