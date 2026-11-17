/// <reference types="vitest" />
import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * Phone speed: start the database connection and the main Arabic font download while the
 * JavaScript is still arriving, instead of after it runs.
 */
function earlyHints(supabaseUrl: string | undefined): Plugin {
  return {
    name: 'early-hints',
    transformIndexHtml(html, ctx) {
      const tags: Array<{ tag: string; attrs: Record<string, string | boolean>; injectTo: 'head' }> = [];
      if (supabaseUrl) {
        tags.push({ tag: 'link', attrs: { rel: 'preconnect', href: new URL(supabaseUrl).origin, crossorigin: true }, injectTo: 'head' });
      }
      const font = Object.keys(ctx.bundle ?? {}).find((f) => /ibm-plex-sans-arabic-arabic-400-normal.*\.woff2$/.test(f));
      if (font) {
        tags.push({ tag: 'link', attrs: { rel: 'preload', as: 'font', type: 'font/woff2', href: `/${font}`, crossorigin: true }, injectTo: 'head' });
      }
      return { html, tags };
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  return {
    plugins: [react(), earlyHints(env.VITE_SUPABASE_URL)],
    test: {
      environment: 'jsdom',
      globals: true,
      setupFiles: ['./src/test/setup.ts'],
      include: ['src/**/*.test.{ts,tsx}', 'certs/**/*.test.ts'],
    },
  };
});
