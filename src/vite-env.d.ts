/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_GOOGLE_MAPS_BROWSER_KEY?: string;
  readonly VITE_GOOGLE_MAPS_PLATFORM_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare const __SVAYIRO_APP_TARGET__: 'all' | 'customer' | 'admin' | string;
