import type { CapacitorConfig } from '@capacitor/cli';

/**
 * Native shell for CORELINE. The web build in `dist` is bundled into the app,
 * so the installed app runs entirely from local files — it does not load the
 * GitHub Pages site. An optional backend URL is still configured in Settings.
 */
const config: CapacitorConfig = {
  appId: 'io.github.weeeedddd.coreline',
  appName: 'CORELINE',
  webDir: 'dist',
  android: {
    // A secure origin keeps localStorage stable and matches the web build's
    // expectations around `window.isSecureContext`.
    allowMixedContent: false,
  },
  plugins: {
    LocalNotifications: {
      smallIcon: 'ic_stat_coreline',
      iconColor: '#63E3C9',
    },
  },
};

export default config;
