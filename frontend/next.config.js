const { loadEnv } = require('../tooling/load-env')

loadEnv({ startDir: __dirname })

module.exports = {
  reactStrictMode: true,
  experimental: {
    workerThreads: false,
    cpus: 1,
  },
  webpack: (config) => {
    if (!config.externals) {
      config.externals = []
    }
    config.externals.push({ deasync: 'commonjs deasync' })
    return config
  },
}
