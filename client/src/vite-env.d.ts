/// <reference types="vite/client" />

// SVG raw imports
declare module '*.svg?raw' {
  const content: string
  export default content
}
