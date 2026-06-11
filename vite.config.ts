import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Project Pages live under /RD-Portal/. Override with VITE_BASE when needed
// (e.g. a custom domain would use "/").
export default defineConfig({
  base: process.env.VITE_BASE ?? "/RD-Portal/",
  plugins: [react()],
  build: { outDir: "dist", sourcemap: false },
});
