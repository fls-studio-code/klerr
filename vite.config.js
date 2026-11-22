import { readFileSync } from 'node:fs'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

const ortVersion = JSON.parse(readFileSync(new URL('./node_modules/onnxruntime-web/package.json', import.meta.url), 'utf8')).version

/**
 * ONNX Runtime (внутри Transformers.js) ссылается на свой 27-мегабайтный .wasm,
 * и Vite кладёт его в dist. Transformers.js всё равно берёт движок с jsDelivr,
 * поэтому файл в сборке только раздувает сайт. Убираем его из сборки,
 * а ссылку на всякий случай переводим на тот же файл на jsDelivr.
 */
function ortWasmFromCdn() {
  return {
    name: 'klerr-ort-wasm-from-cdn',
    apply: 'build',
    generateBundle(_, bundle) {
      for (const [file, asset] of Object.entries(bundle)) {
        if (asset.type !== 'asset' || !/ort-wasm-[^/]*\.wasm$/.test(file)) continue
        const original = file.split('/').pop().replace(/-[A-Za-z0-9_-]{8}(?=\.wasm$)/, '')
        const url = `https://cdn.jsdelivr.net/npm/onnxruntime-web@${ortVersion}/dist/${original}`
        for (const chunk of Object.values(bundle)) {
          if (chunk.type === 'chunk') chunk.code = chunk.code.split('/' + file).join(url)
        }
        delete bundle[file]
      }
    },
  }
}

export default defineConfig({
  plugins: [vue()],
  worker: {
    format: 'es',
    plugins: () => [ortWasmFromCdn()],
  },
  base: '/',
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    chunkSizeWarningLimit: 900,
  },
})
