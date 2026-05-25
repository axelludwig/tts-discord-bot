import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/config': 'http://localhost:3005',
      '/health': 'http://localhost:3005',
      '/guilds': 'http://localhost:3005',
      '/voices': 'http://localhost:3005',
      '/voice': 'http://localhost:3005',
      '/speak': 'http://localhost:3005',
      '/stop': 'http://localhost:3005',
      '/status': 'http://localhost:3005',
      '/socket.io': {
        target: 'http://localhost:3005',
        ws: true,
      },
    },
  },
});
