import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const websiteRoot = dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  turbopack: {
    root: websiteRoot,
  },
};

export default nextConfig;
