import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: [
      'tests/dsh-probe/**/*.spec.ts',
      'tests/dsh-migration/**/*.spec.ts',
    ],
    fileParallelism: false,
    server: {
      deps: {
        inline: ['@deepseek-ai/cordis-plugin-hmr'],
      },
    },
    testTimeout: 20_000,
    hookTimeout: 20_000,
  },
})
