/** Texto truncado com tooltip visual (balão) + title nativo para acessibilidade. */
export function HierCellText({
  value,
  tooltip,
  className,
}: {
  value: string;
  /** Texto completo no hover; padrão = mesmo valor da célula. */
  tooltip?: string;
  className?: string;
}) {
  const trimmed = value?.trim();
  const display = trimmed || "—";
  const tipRaw = (tooltip?.trim() || trimmed) || "";
  const tip = tipRaw && tipRaw !== "—" ? tipRaw : undefined;

  return (
    <span
      className={`hier-cell-text${className ? ` ${className}` : ""}`}
      data-tip={tip}
      title={tip}
      tabIndex={tip ? 0 : undefined}
    >
      {display}
    </span>
  );
}
