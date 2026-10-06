import type { CSSProperties } from "react";

/** Máscara CSS para ícones PNG (cor vem do background-color do elemento). */
export function iconMaskStyle(assetUrl: string): CSSProperties {
  // Não usar encodeURI: URLs do Vite já vêm codificadas; re-codificar quebra o arquivo.
  const quoted = `url("${assetUrl}")`;
  return {
    WebkitMaskImage: quoted,
    maskImage: quoted,
  };
}
