import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['tests/dsh-probe/**/*.spec.ts'],
    fileParallelism: false,
    testTimeout: 20_000,
    hookTimeout: 20_000,
  },
})
