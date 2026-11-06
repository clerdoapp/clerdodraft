/// <reference types="vite/client" />
interface ImportMetaEnv {
  readonly VITE_RELEASE_REPO?: string;
}

declare module 'hyphen/*' {
  export function hyphenateSync(text: string): string;
}

declare module 'pdfjs-dist/legacy/build/pdf.min.mjs' {
  export * from 'pdfjs-dist';
}
