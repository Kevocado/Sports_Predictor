/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_NFL_API_BASE_URL?: string;
  readonly VITE_CFB_API_BASE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
