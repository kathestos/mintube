import type { NextConfig } from "next";

/**
 * NextAuth needs the public site URL. On Vercel, `VERCEL_URL` is set automatically
 * (hostname only, no scheme). If you use a custom domain, set `NEXTAUTH_URL` in
 * Vercel env to `https://your-domain.com` so OAuth matches what users see.
 */
const nextAuthUrl =
  process.env.NEXTAUTH_URL ||
  (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : undefined);

const nextConfig: NextConfig = {
  ...(nextAuthUrl ? { env: { NEXTAUTH_URL: nextAuthUrl } } : {}),
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "*.ytimg.com",
        pathname: "/**",
      },
    ],
  },
};

export default nextConfig;
