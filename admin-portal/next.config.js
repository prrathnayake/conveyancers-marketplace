/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    externalDir: true,
  },
  reactStrictMode: true,
  webpack: (config, { isServer }) => {
    if (isServer) {
      const externals = ['better-sqlite3', 'bcryptjs', 'cookie', 'jsonwebtoken', 'twilio', 'nodemailer']
      config.externals = config.externals || []
      for (const pkg of externals) {
        if (!config.externals.includes(pkg)) {
          config.externals.push(pkg)
        }
      }
    }
    return config
  },
}

module.exports = nextConfig
