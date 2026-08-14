/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_PUBLIC_APP_URL?: string;
  readonly VITE_ADMIN_APP_URL?: string;
  readonly VITE_API_URL?: string;
  readonly VITE_APP_TARGET?: string;
  readonly VITE_MAINTENANCE_MODE?: string;
  readonly VITE_COMING_SOON?: string;
  readonly VITE_COMING_SOON_PREVIEW_KEY?: string;
  readonly VITE_GOOGLE_MAPS_BROWSER_KEY?: string;
  readonly VITE_GOOGLE_MAPS_PLATFORM_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare const __SVAYIRO_APP_TARGET__: 'all' | 'customer' | 'admin' | string;
