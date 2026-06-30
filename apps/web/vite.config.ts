import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// React + Tailwind v4（官方 Vite 插件，替代 PostCSS）。HeroUI V3 的样式经全局 CSS @import 引入。
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
  },
  build: {
    outDir: "dist",
  },
});
