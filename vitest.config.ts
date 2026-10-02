import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  plugins: [react()],
  resolve: { alias: {
      '@': path.resolve(__dirname, '.'),
      // 'server-only' throws outside React server builds; tests run plain Node.
      'server-only': path.resolve(__dirname, 'tests/server-only-stub.ts'),
    } },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.{ts,tsx}'],
    setupFiles: ['tests/setup.ts'],
    restoreMocks: true,
  },
});
