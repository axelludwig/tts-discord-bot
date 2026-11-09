import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

const API_PATHS = ['/config', '/health', '/guilds', '/voices', '/voice', '/speak', '/skip', '/stop', '/queue', '/status'];

export default defineConfig(({ mode }) => {
  // Share API_PORT with the backend instead of hardcoding it.
  const backendEnv = loadEnv(mode, '../backend', '');
  const target = `http://localhost:${backendEnv.API_PORT || '3000'}`;

  return {
    plugins: [react()],
    server: {
      proxy: {
        ...Object.fromEntries(API_PATHS.map(path => [path, target])),
        '/socket.io': { target, ws: true },
      },
    },
  };
});
