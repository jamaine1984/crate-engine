import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.crateshipgames.crateengine',
  appName: 'Crate Engine',
  webDir: 'web',
  server: {
    androidScheme: 'https',
    // Allow external connections for multiplayer, HDRI, etc
    allowNavigation: ['*.fly.dev', '*.polyhaven.org', '*.jsdelivr.net', '*.cloudflare.com'],
  },
  ios: {
    contentInset: 'automatic',
    backgroundColor: '#0a0a0a',
  },
  android: {
    backgroundColor: '#0a0a0a',
  },
};

export default config;
