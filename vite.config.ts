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
      'process.env': {
        API_KEY: JSON.stringify(apiKey),
        NODE_ENV: JSON.stringify(mode)
      }
    },
    build: {
      chunkSizeWarningLimit: 1600,
    }
  };
});