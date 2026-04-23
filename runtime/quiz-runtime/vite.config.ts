import { defineConfig } from "vite";
import preact from "@preact/preset-vite";

export default defineConfig({
  plugins: [preact()],
  build: {
    outDir: "dist",
    rollupOptions: {
      input: "src/index.tsx",
      output: {
        entryFileNames: "quiz-runtime.[hash].js",
        chunkFileNames: "quiz-runtime-chunk.[hash].js",
        assetFileNames: "quiz-runtime.[hash].[ext]",
      },
    },
    // Target < 50KB gzipped
    minify: "esbuild",
    target: "es2020",
    cssCodeSplit: false,
  },
});
