import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'mz.com.carrinhaescolar.app',
  appName: 'Carrinha Escolar',
  webDir: 'dist/spa',
  server: process.env.CAPACITOR_SERVER_URL
    ? {
        url: process.env.CAPACITOR_SERVER_URL,
        cleartext: true
      }
    : undefined
};

export default config;
