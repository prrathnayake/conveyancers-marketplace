const path = require('path')
const { loadEnv } = require('../tooling/load-env')

loadEnv({ startDir: __dirname })

/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    externalDir: true,
  },
  reactStrictMode: true,
  webpack: (config, { isServer }) => {
    if (isServer) {
      const externals = ['pg', 'bcryptjs', 'cookie', 'jsonwebtoken', 'twilio', 'nodemailer']
      config.externals = config.externals || []
      for (const pkg of externals) {
        if (!config.externals.includes(pkg)) {
          config.externals.push(pkg)
        }
      }
    }
    config.resolve = config.resolve || {}
    config.resolve.alias = {
      ...(config.resolve.alias || {}),
      '@frontend': path.resolve(__dirname, '../frontend'),
    }
    return config
  },
}

module.exports = nextConfig
