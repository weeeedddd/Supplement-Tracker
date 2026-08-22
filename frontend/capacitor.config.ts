/// <reference types="@capacitor/local-notifications" />

import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'app.coreline.tracker',
  appName: 'CORELINE',
  webDir: 'dist',
  backgroundColor: '#050707',
  loggingBehavior: 'debug',
  server: {
    // Match the origin already trusted by the managed CORELINE backend so the
    // native shell can use existing account/Guild services without broad CORS.
    hostname: 'weeeedddd.github.io',
    androidScheme: 'https',
    cleartext: false,
  },
  android: {
    backgroundColor: '#050707',
    allowMixedContent: false,
    zoomEnabled: false,
  },
  plugins: {
    LocalNotifications: {
      smallIcon: 'ic_stat_coreline',
      iconColor: '#78e7ed',
    },
  },
};

export default config;
