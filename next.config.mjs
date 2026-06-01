import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

const projectRoot = dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Pin the workspace root to this project (a stray lockfile elsewhere on the
  // machine would otherwise confuse Next's root detection).
  outputFileTracingRoot: projectRoot,
  // The analyze API receives base64 photos in the request body.
  // Photos are resized in the browser first, but allow generous headroom.
  experimental: {
    serverActions: {
      bodySizeLimit: "12mb",
    },
  },
};

export default nextConfig;
