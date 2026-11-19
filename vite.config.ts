import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  
  // Captura as chaves do sistema (Vercel) ou do arquivo .env
  const apiKey = process.env.API_KEY || 
                 process.env.GEMINI_API_KEY || 
                 process.env.MINHA_CHAVE_GEMINI || 
                 env.API_KEY || 
                 env.GEMINI_API_KEY || 
                 env.MINHA_CHAVE_GEMINI || 
                 '';

  return {
    plugins: [react()],
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
    // Define 'process.env' para evitar erro "process is not defined" no navegador
    // E injeta a API_KEY se disponível
    define: {
      'process.env.API_KEY': JSON.stringify(apiKey),
      'process.env.NODE_ENV': JSON.stringify(mode),
      'process.env': JSON.stringify({
        API_KEY: apiKey,
        NODE_ENV: mode,
      }),
    },
    build: {
      chunkSizeWarningLimit: 2500,
      rollupOptions: {
        output: {
          manualChunks(id) {
            const normId = id.replace(/\\/g, '/');
            if (
              normId.includes('commonjsHelpers') ||
              normId.includes('/node_modules/tslib/') ||
              normId.includes('/node_modules/react/') ||
              normId.includes('/node_modules/react-dom/') ||
              normId.includes('/node_modules/scheduler/') ||
              normId.includes('/node_modules/react-is/') ||
              normId.includes('/node_modules/prop-types/')
            ) {
              return 'vendor-core';
            }
            if (!normId.includes('/node_modules/')) {
              return undefined;
            }
            if (
              normId.includes('/node_modules/firebase/') ||
              normId.includes('/node_modules/@firebase/') ||
              normId.includes('/node_modules/idb/')
            ) {
              return 'vendor-firebase';
            }
            if (normId.includes('/node_modules/pdfjs-dist/')) {
              return 'vendor-pdfjs';
            }
            if (
              normId.includes('/node_modules/html2pdf.js/') ||
              normId.includes('/node_modules/jspdf/') ||
              normId.includes('/node_modules/html2canvas/') ||
              normId.includes('/node_modules/pdf-lib/') ||
              normId.includes('/node_modules/@pdf-lib/') ||
              normId.includes('/node_modules/pako/') ||
              normId.includes('/node_modules/fflate/')
            ) {
              return 'vendor-pdf-export';
            }
            if (normId.includes('/node_modules/lucide-react/')) {
              return 'vendor-icons';
            }
            if (
              normId.includes('/node_modules/@tiptap/') ||
              normId.includes('/node_modules/prosemirror-')
            ) {
              return 'vendor-editor';
            }
            if (
              normId.includes('/node_modules/recharts/') ||
              normId.includes('/node_modules/d3-') ||
              normId.includes('/node_modules/victory-vendor/')
            ) {
              return 'vendor-charts';
            }
            if (
              normId.includes('/node_modules/emoji-picker-react/') ||
              normId.includes('/node_modules/motion/') ||
              normId.includes('/node_modules/motion-dom/') ||
              normId.includes('/node_modules/motion-utils/') ||
              normId.includes('/node_modules/framer-motion/') ||
              normId.includes('/node_modules/@google/genai/') ||
              normId.includes('/node_modules/@dnd-kit/') ||
              normId.includes('/node_modules/date-fns/') ||
              normId.includes('/node_modules/date-fns-tz/') ||
              normId.includes('/node_modules/react-markdown/') ||
              normId.includes('/node_modules/micromark') ||
              normId.includes('/node_modules/mdast-') ||
              normId.includes('/node_modules/hast-') ||
              normId.includes('/node_modules/unified/') ||
              normId.includes('/node_modules/remark-')
            ) {
              return 'vendor-libs';
            }
            return undefined;
          },
        },
      },
    }
  };
});