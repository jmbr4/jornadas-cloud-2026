/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL?: string
  readonly VITE_SECONDS_PER_QUESTION?: string
  readonly VITE_SPEED_BONUS_MAX?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

/* Los packs de Phosphor son hojas de estilo; TypeScript necesita el aviso. */
declare module '@phosphor-icons/web/regular'
declare module '@phosphor-icons/web/fill'
