import type { NextConfig } from "next";
const config: NextConfig = {
  experimental: { useTypeScriptCli: false, cpus: 2 },
  poweredByHeader: false,
  output: "standalone",
  allowedDevOrigins: ["127.0.0.1", "localhost"],
};
export default config;
