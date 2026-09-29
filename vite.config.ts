import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

// @ts-expect-error process is a nodejs global
const host = process.env.TAURI_DEV_HOST;
const isVitest = Boolean(process.env.VITEST);

// https://vite.dev/config/
export default defineConfig(async () => ({
  plugins: [react()],
  test: {
    // Never let tests read or write the developer's real ~/.sentinel
    setupFiles: ['./src/test/isolateHome.ts'],
  },
  resolve: {
    // The app bundle maps `path` to a POSIX polyfill on every OS; tests use Node's POSIX path so
    // they check the same behaviour on a Windows runner as the app has on Windows
    alias: isVitest ? [{ find: /^(?:node:)?path$/, replacement: 'node:path/posix' }] : {
      path: path.resolve(__dirname, "src/utils/pathPolyfill.ts"),
      "node:path": path.resolve(__dirname, "src/utils/pathPolyfill.ts"),
      fs: path.resolve(__dirname, "src/utils/fsPolyfill.ts"),
      "node:fs": path.resolve(__dirname, "src/utils/fsPolyfill.ts"),
      crypto: path.resolve(__dirname, "src/utils/cryptoPolyfill.ts"),
      "node:crypto": path.resolve(__dirname, "src/utils/cryptoPolyfill.ts"),
    },
  },

  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent Vite from obscuring rust errors
  clearScreen: false,
  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      // 3. tell Vite to ignore watching `src-tauri`
      ignored: ["**/src-tauri/**"],
    },
  },
}));
