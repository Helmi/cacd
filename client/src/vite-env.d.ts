/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_APP_VERSION: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

// SVG raw imports
declare module '*.svg?raw' {
  const content: string
  export default content
}
