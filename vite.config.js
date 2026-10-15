import { defineConfig } from "vite";
import { resolve } from "path";

export default defineConfig({
  // Сайт лежить у підпапці репозиторію на GitHub Pages.
  // Якщо перейменуєш репозиторій — зміни й цей рядок.
  base: "/lyst-personazha/",
  build: {
    outDir: "dist",
    rollupOptions: {
      input: {
        index: resolve(__dirname, "index.html"),
        background: resolve(__dirname, "background.html"),
      },
    },
  },
});
