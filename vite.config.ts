// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - tanstackStart, viteReact, tailwindcss, tsConfigPaths, cloudflare (build-only),
//     componentTagger (dev-only), VITE_* env injection, @ path alias, React/TanStack dedupe,
//     error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... } }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

const windowsPreview = process.env.NEARBITES_WINDOWS_PREVIEW === "1";

// Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
// @cloudflare/vite-plugin builds from this — wrangler.jsonc main alone is insufficient.
export default defineConfig({
  // In local dev, externalize the framework's server runtime so Vite does not
  // recursively transform its full Cloudflare module graph on first request.
  vite: {
    ssr: process.env.NODE_ENV === "production" ? undefined : { noExternal: [] },
  },
  nitro: windowsPreview
    ? { preset: "bun", output: { dir: ".output-windows" } }
    : { preset: process.env.VERCEL ? "vercel" : "cloudflare-module" },
  tanstackStart: {
    // The wrapped entry imports TanStack's generated server entry. In Vite dev,
    // that name resolves back to the wrapper and creates a recursive module load.
    // Use the generated entry in dev and keep the wrapper for production builds.
    server: process.env.NODE_ENV === "production" ? { entry: "server-prod" } : undefined,
  },
});
