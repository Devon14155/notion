import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  build: {
    rolldownOptions: {
      output: {
        codeSplitting: {
          minSize: 18000,
          groups: [
            {
              name: "vendor-react",
              test: /node_modules[\\/](?:react|react-dom|scheduler)[\\/]/,
              priority: 30
            },
            {
              name: "vendor-editor-table",
              test: /node_modules[\\/]@tiptap[\\/]extension-table[\\/]/,
              priority: 20
            },
            {
              name: "vendor-editor-lists",
              test: /node_modules[\\/]@tiptap[\\/]extension-list[\\/]/,
              priority: 20
            },
            {
              name: "vendor-editor-extensions",
              test: /node_modules[\\/]@tiptap[\\/]extensions[\\/]/,
              priority: 20
            },
            {
              name: "vendor-editor",
              test: /node_modules[\\/](?:@tiptap|prosemirror-|orderedmap|rope-sequence)/,
              priority: 10
            }
          ]
        }
      }
    }
  }
});
