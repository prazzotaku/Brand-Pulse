/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  webpack: (config, { isServer }) => {
    // Exclude Prisma client from server-side bundles to avoid esbuild trying
    // to resolve the absolute path to schema.prisma that gets baked into
    // the generated client on Windows.
    if (isServer) {
      config.externals.push("@prisma/client");
    }
    return config;
  },
};

export default nextConfig;
