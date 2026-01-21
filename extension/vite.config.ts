import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'
import { copyFileSync, mkdirSync, existsSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'

function copyManifestAndIcons() {
  return {
    name: 'copy-manifest-and-icons',
    writeBundle() {
      const distDir = resolve(__dirname, 'dist')
      const iconsDistDir = join(distDir, 'icons')

      // Copy manifest.json and fix paths
      const manifest = JSON.parse(readFileSync(resolve(__dirname, 'manifest.json'), 'utf-8'))
      // Fix service worker path (remove src/ prefix)
      if (manifest.background?.service_worker) {
        manifest.background.service_worker = manifest.background.service_worker.replace('src/', '')
      }
      // Fix content scripts paths (remove src/ prefix)
      if (manifest.content_scripts) {
        manifest.content_scripts.forEach(script => {
          if (script.js) {
            script.js = script.js.map((path: string) => path.replace('src/', ''))
          }
        })
      }
      writeFileSync(join(distDir, 'manifest.json'), JSON.stringify(manifest, null, 2))

      // Create icons directory and copy icons
      if (!existsSync(iconsDistDir)) {
        mkdirSync(iconsDistDir, { recursive: true })
      }
      const iconSizes = ['16', '32', '48', '128']
      iconSizes.forEach(size => {
        const srcIcon = resolve(__dirname, 'public', `icon${size}.png`)
        const destIcon = join(iconsDistDir, `icon${size}.png`)
        if (existsSync(srcIcon)) {
          copyFileSync(srcIcon, destIcon)
        }
      })
    }
  }
}

export default defineConfig({
  plugins: [react(), copyManifestAndIcons()],
  build: {
    rollupOptions: {
      input: {
        popup: resolve(__dirname, 'popup.html'),
        'content/detector': resolve(__dirname, 'src/content/detector.ts'),
        'background/service-worker': resolve(__dirname, 'src/background/service-worker.ts')
      },
      output: {
        entryFileNames: '[name].js',
        chunkFileNames: '[name].js',
        assetFileNames: '[name].[ext]'
      }
    },
    outDir: 'dist',
    emptyOutDir: true
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, './src')
    }
  }
})
