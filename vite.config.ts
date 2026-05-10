import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  // Relative asset paths so the built bundle works under file:// in the
  // packaged Electron app (default '/' resolves to the filesystem root).
  base: "./",
  plugins: [react()],
});
