import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['tests/dsh-probe/**/*.spec.ts'],
    exclude: ['tests/dsh-probe/sandbox.e2e.spec.ts'],
    fileParallelism: false,
    testTimeout: 20_000,
    hookTimeout: 20_000,
  },
})
