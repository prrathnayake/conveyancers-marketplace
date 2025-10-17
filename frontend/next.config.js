const { loadEnv } = require('../tooling/load-env')

loadEnv({ startDir: __dirname })

module.exports = { reactStrictMode: true }
