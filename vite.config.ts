import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";
import JavaScriptObfuscator from "javascript-obfuscator";

function productionObfuscatorPlugin(): Plugin {
  return {
    name: "vite-production-obfuscator",
    apply: "build",
    enforce: "post",
    renderChunk(code, chunk) {
      // Exclude vendor chunks, worker chunks, and third-party WebUSB / WASM / crypto binaries
      const isVendorOrBinary =
        chunk.name.includes("vendor") ||
        chunk.name.includes("worker") ||
        chunk.name.includes("webusb") ||
        chunk.name.includes("crypto") ||
        chunk.fileName.includes("worker") ||
        chunk.fileName.includes("vendor") ||
        chunk.fileName.includes("webusb");

      if (isVendorOrBinary) {
        return null;
      }

      // Target application chunks containing core src/ logic
      const isAppChunk =
        chunk.name === "index" ||
        chunk.facadeModuleId?.includes("/src/") ||
        Object.keys(chunk.modules || {}).some(
          (modId) => modId.includes("/src/") && !modId.includes("node_modules")
        );

      if (!isAppChunk) {
        return null;
      }

      const obfuscationResult = JavaScriptObfuscator.obfuscate(code, {
        compact: true,
        controlFlowFlattening: true,
        controlFlowFlatteningThreshold: 0.35,
        stringArray: true,
        stringArrayThreshold: 1,
        stringArrayEncoding: ["base64"],
        splitStrings: true,
        splitStringsChunkLength: 5,
        transformObjectKeys: true,
        debugProtection: true,
        disableConsoleOutput: true,
        sourceMap: false,
      });

      return {
        code: obfuscationResult.getObfuscatedCode(),
        map: null,
      };
    },
  };
}

export default defineConfig({
  base: "./",
  plugins: [
    react(),
    tailwindcss(),
    productionObfuscatorPlugin(),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    host: "0.0.0.0",
    port: 3000,
    allowedHosts: true,
  },
  build: {
    sourcemap: false,
    minify: "terser",
    terserOptions: {
      compress: {
        drop_debugger: true,
        pure_funcs: ["console.log", "console.debug"],
      },
      format: {
        comments: false,
      },
    },
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("node_modules")) {
            // Segregate raw WebUSB, WASM, and crypto libraries to prevent performance hits
            if (
              id.includes("@yume-chan") ||
              id.includes("pkijs") ||
              id.includes("asn1js") ||
              id.includes("pvtsutils")
            ) {
              return "vendor-webusb-crypto";
            }
            return "vendor";
          }
        },
      },
    },
  },
});

