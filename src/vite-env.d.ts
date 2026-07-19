/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_GOOGLE_MAPS_BROWSER_KEY?: string;
  readonly VITE_GOOGLE_MAPS_PLATFORM_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
