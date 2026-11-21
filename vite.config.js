import { defineConfig } from 'vite'
import uni from '@dcloudio/vite-plugin-uni'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const uniRequire = createRequire(require.resolve('@dcloudio/vite-plugin-uni/package.json'))
// Uni's customized Vue runtime must use its matching SFC compiler.
const uniCompiler = uniRequire('@vue/compiler-sfc')
const uniShared = uniRequire.resolve('@vue/shared/dist/shared.esm-bundler.js')
const i18nRuntime = require.resolve('vue-i18n/dist/vue-i18n.runtime.esm-bundler.js')

// https://vitejs.dev/config/
export default defineConfig({
  define: { __MAOYI_REVIEW__: JSON.stringify(process.env.VITE_ENABLE_REVIEW === 'true') },
  server: {
    host: '127.0.0.1',
    fs: {
      deny: ['.env', '.env.*', '*.{crt,pem}', '**/.git/**', '**/.secrets/**', '**/.data/**'],
    },
    proxy: { '/api': 'http://127.0.0.1:8080' },
  },
  plugins: [
    uni({ vueOptions: { compiler: uniCompiler } }),
    {
      name: 'project:dependency-compatibility',
      enforce: 'post',
      // Uni's platform plugins otherwise select their bundled v9 runtime.
      config: () => ({
        // Uni's H5 defaults disable Vite's filesystem access checks.
        server: { fs: { strict: true } },
        resolve: {
          alias: [
            { find: /^vue-i18n(?:\/runtime)?$/, replacement: i18nRuntime },
            { find: /^@vue\/shared$/, replacement: uniShared },
          ],
        },
      }),
    },
  ],
})
