import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { expect, it } from 'vitest'

it.skipIf(process.env.TIANWEN_NODE_PROJECT_TEST !== '1')('published project executor preserves encoded TS identity and immutable dependency bytes', async () => {
  const packageRoot = resolve('packages/tianwen-runtime-bundle')
  const manifest = JSON.parse(readFileSync(resolve(packageRoot, 'package.json'), 'utf8'))
  const { prepareIsolatedNodeProject } = await import(pathToFileURL(resolve(packageRoot, manifest.exports['.'].default)).href)
  const runner = await prepareIsolatedNodeProject({ cliPath: 'D:/DevData/docker-desktop/app/resources/bin/docker.exe', endpoint: 'npipe:////./pipe/dockerDesktopLinuxEngine',
    imageRef: 'public.ecr.aws/docker/library/node@sha256:b74031e546d7f4faf561d797ac1b76beccac856a042815ca77db4fd047581605', imageId: 'sha256:b74031e546d7f4faf561d797ac1b76beccac856a042815ca77db4fd047581605',
    workRoot: 'D:/DevData/tianwen-node-project-executor-20261003/native-regression' }, new AbortController().signal)
  const result = await runner.run({ entryPath: 'entry.mjs', input: '{}', files: [
    { path: 'entry.mjs', content: `import {n} from './constructor';import {readFileSync,writeFileSync} from 'node:fs';const file='/project/dep%20.js',old=readFileSync(file,'utf8');let denied=false;try{writeFileSync(file,'export const token={wrong:true}')}catch(e){if(!['EROFS','EACCES','EPERM'].includes(e.code))throw e;denied=true;}const a=await import('./dep%2520.ts'),b=await import('./dep%2520.js');console.log(JSON.stringify({denied,same:a.token===b.token,intact:readFileSync(file,'utf8')===old,n}));` },
    { path: 'dep%20.ts', content: 'export const token: object = {};' },
    { path: 'constructor', content: 'export const n=7;' },
  ] }, new AbortController().signal)
  expect(result.status).toBe('completed')
  if (result.status === 'completed') { expect(result.exitCode).toBe(0); expect(result.stderr).toBe(''); expect(JSON.parse(result.stdout)).toEqual({ denied: true, same: true, intact: true, n: 7 }) }
})
