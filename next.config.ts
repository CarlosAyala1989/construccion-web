import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@napi-rs/canvas", "pdfjs-dist"],
  outputFileTracingIncludes: {
    "/api/documents/view": [
      "./node_modules/@napi-rs/canvas*/**/*",
      "./node_modules/pdfjs-dist/**/*",
    ],
  },
};

export default nextConfig;
