import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) return;
          if (
            id.includes("/@tiptap/") ||
            id.includes("/prosemirror-") ||
            id.includes("/orderedmap/") ||
            id.includes("/rope-sequence/")
          ) {
            return "vendor-editor";
          }
          if (
            id.includes("/react/") ||
            id.includes("/react-dom/") ||
            id.includes("/scheduler/")
          ) {
            return "vendor-react";
          }
        }
      }
    }
  }
});
