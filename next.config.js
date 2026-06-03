/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '*.supabase.co',
        pathname: '/storage/v1/object/public/**',
      },
    ],
  },

  async redirects() {
    return [
      /**
       * Legacy alias → canonical assessment route.
       * permanent: false so we can remove or change this without cache risk
       * while the canonical route is new. Upgrade to permanent: true once
       * /assessments/gut-check is confirmed stable in production.
       *
       * Query params (e.g. ?submission_id=...) are preserved automatically.
       */
      {
        source: '/gut-check',
        destination: '/assessments/gut-check',
        permanent: false,
      },
      /**
       * Legal route aliases → canonical legal pages (Packet E).
       * Covers older/published footer links and external inbound links that
       * used /privacy-policy or /disclaimer. permanent: false until the legal
       * pages are finalized and the canonical paths are confirmed stable.
       */
      {
        source: '/privacy-policy',
        destination: '/privacy',
        permanent: false,
      },
      {
        source: '/disclaimer',
        destination: '/health-disclaimer',
        permanent: false,
      },
    ];
  },
};

module.exports = nextConfig;
