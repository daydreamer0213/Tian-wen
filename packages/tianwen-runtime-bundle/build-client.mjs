import { build } from 'esbuild'
import { writeFile } from 'node:fs/promises'

const result = await build({
  entryPoints: ['src/client.tsx'],
  outfile: 'dist/client.js',
  bundle: true,
  platform: 'browser',
  format: 'cjs',
  jsx: 'automatic',
  external: ['react', 'react/jsx-runtime', '@deepseek-ai/*'],
  metafile: true,
  banner: {
    js: "window.__ModuleLoader__.load({ id: '@tianwen/runtime-bundle', factory: (require) => { var module = { exports: {} }; var exports = module.exports;",
  },
  footer: { js: 'return module.exports; } });' },
})

await writeFile('dist/client.meta.json', JSON.stringify(result.metafile))
