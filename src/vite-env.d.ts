/// <reference types="vite/client" />

import type { HTMLAttributes } from "react";

declare global {
  namespace JSX {
    interface IntrinsicElements {
      webview: HTMLAttributes<HTMLElement> & {
        partition?: string;
        src?: string;
        webpreferences?: string;
      };
    }
  }
}

export {};
