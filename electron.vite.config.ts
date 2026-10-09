import { resolve } from 'node:path'
import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  main: {
    build: {
      rollupOptions: {
        input: resolve(__dirname, 'electron/src/main.ts'),
        external: [
          'better-sqlite3',
          'mammoth',
          'node-pty',
          'sharp',
          'tesseract.js',
          /^@napi-rs\/canvas(?:\/.*)?$/,
          /^@tesseract\.js-data(?:\/.*)?$/,
          /^pdfjs-dist(?:\/.*)?$/
        ]
      }
    }
  },
  preload: {
    build: {
      rollupOptions: {
        input: {
          preload: resolve(__dirname, 'electron/src/preload.ts'),
          'native-overlay-preload': resolve(
            __dirname,
            'electron/src/overlay/native-overlay-preload.ts'
          )
        },
        output: {
          format: 'cjs',
          entryFileNames: '[name].cjs'
        }
      }
    }
  },
  renderer: {
    root: '.',
    build: {
      rollupOptions: {
        input: resolve(__dirname, 'index.html')
      }
    },
    resolve: {
      alias: {
        '@': resolve(__dirname, 'src'),
        '@shared': resolve(__dirname, 'shared')
      }
    },
    plugins: [react()]
  }
})
