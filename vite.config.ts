import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";
import { VitePWA } from 'vite-plugin-pwa';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "127.0.0.1",
    port: 8080,
    fs: { deny: [".env", ".env.*", "*.{crt,pem}", "**/.git/**", "**/verification-proofs/**"] },
    proxy: {
      "/api": {
        target: "http://127.0.0.1:8787",
        changeOrigin: true,
      },
    },
    hmr: {
      overlay: false,
    },
  },
  build: { outDir: mode === "owner" ? "owner-dist" : "dist", rolldownOptions: { input: mode === "owner" ? { owner: path.resolve(__dirname, "owner.html") } : { app: path.resolve(__dirname, "index.html") } } },
  plugins: [
    react(),
    mode === "development" && componentTagger(),
    mode !== "owner" && VitePWA({
      registerType: 'autoUpdate',
      workbox: {
        clientsClaim: true,
        skipWaiting: true,
      },
      includeAssets: ['favicon.ico', 'robots.txt', 'logo.svg'],
      manifest: {
        name: 'GuardianCare',
        short_name: 'GuardianCare',
        description: 'Real-time elder health monitoring with predictive alerts and multilingual voice reminders.',
        theme_color: '#0F2D5C',
        background_color: '#F8FAFC',
        display: 'standalone',
        scope: '/',
        start_url: '/',
        icons: [
          {
            src: 'pwa-192.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: 'pwa-512.png',
            sizes: '512x512',
            type: 'image/png'
          },
          {
            src: 'logo.svg',
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'any maskable'
          }
        ]
      }
    })
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
    dedupe: ["react", "react-dom", "react/jsx-runtime", "react/jsx-dev-runtime", "@tanstack/react-query", "@tanstack/query-core"],
  },
  test: {
    globals: true,
    environment: 'jsdom',
    include: ['src/test/**/*.test.ts', 'src/test/**/*.test.tsx'],
    exclude: ['node_modules/**', 'dist/**'],
  },
}));
