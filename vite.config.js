import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Frontend build only. Netlify Functions in netlify/functions are bundled by Netlify.
export default defineConfig({
  plugins: [react()],
  build: { outDir: "dist" },
});
