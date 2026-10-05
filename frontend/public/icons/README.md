# Ícones do Report (substituição manual)

Coloque aqui os arquivos de ícone. O Vite serve tudo em `public/` na raiz do site.

## Reteste (card roxo)

1. Exporte o ícone da planilha/mock (PNG ou SVG, fundo transparente).
2. Salve **com um destes nomes** (o primeiro que existir é usado):
   - `reteste.svg` (recomendado)
   - `reteste.png`
3. Tamanho sugerido: **32×32 px** ou SVG com viewBox quadrado.
4. Recarregue o navegador (`Ctrl+F5`). Não precisa reiniciar o `npm run dev`.

Caminho no disco:

`frontend/public/icons/reteste.svg`

URL no browser:

`http://localhost:5173/icons/reteste.svg`

## Outros cards (opcional)

Se quiser o mesmo esquema para Total, Foursys e Cliente, use:

- `total.svg` / `total.png`
- `foursys.svg` / `foursys.png`
- `cliente.svg` / `cliente.png`

(O código do Reteste já usa imagem; os demais ainda são SVG inline em `src/components/ImpactResponsaveisPanel.tsx`.)

## Ícone ainda “estranho”?

- Prefira **SVG** exportado do Figma/Excel (vetor nítido em qualquer zoom).
- Evite PNG muito pequeno (< 24 px).
- Se o PNG tiver margem grande, recorte antes de exportar.
