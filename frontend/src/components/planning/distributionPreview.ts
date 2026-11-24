export type DistributionPreview = {
  before: number;
  delta: number;
  after: number;
  text: string;
};

function typedQuantity(draft: string): number {
  if (draft === "") return 0;
  const value = Number(draft);
  return Number.isFinite(value) ? value : 0;
}

function formatDistributionPreview(before: number, delta: number, after: number): string {
  if (delta === 0) return String(before);
  if (delta > 0) return `${before} + ${delta} = ${after}`;
  return `${before} - ${Math.abs(delta)} = ${after}`;
}

/** Preview da linha. `distributedCount` já inclui a célula salva; o rascunho entra só pela diferença. */
export function distributionPreview(
  distributedCount: number,
  savedQuantity: number,
  draft: string,
): DistributionPreview {
  const before = distributedCount;
  const delta = typedQuantity(draft) - savedQuantity;
  const after = before + delta;
  return {
    before,
    delta,
    after,
    text: formatDistributionPreview(before, delta, after),
  };
}
