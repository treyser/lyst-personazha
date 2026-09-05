import { defineConfig } from "vite";

export default defineConfig({
  // Сайт лежить у підпапці репозиторію на GitHub Pages.
  // Якщо перейменуєш репозиторій — зміни й цей рядок.
  base: "/lyst-personazha/",
  build: { outDir: "dist" },
});
