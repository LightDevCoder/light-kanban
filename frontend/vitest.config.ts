import { defineConfig } from 'vitest/config'

// Unit tests for the pure frontend logic (product tour state machine and
// tooltip geometry). Node environment: no DOM, no browser — the logic
// modules under test must stay DOM-free.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
