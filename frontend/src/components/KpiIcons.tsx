import type { CSSProperties } from "react";

/**
 * Ícones dos KPIs principais, lidos de fonte/util/status/*.png e aplicados
 * como máscara CSS para receber a cor de cada indicador.
 */
const statusIcons = import.meta.glob<string>("../../../fonte/util/status/*.png", {
  eager: true,
  query: "?url",
  import: "default",
});

function statusIconUrl(fileName: string): string | undefined {
  const target = `/${fileName}`.toLowerCase();
  return Object.entries(statusIcons).find(([p]) => p.toLowerCase().endsWith(target))?.[1];
}

type I = { size?: number };

function MaskIcon({ file, color, size = 16 }: I & { file: string; color: string }) {
  const src = statusIconUrl(file);
  if (!src) return null;
  const style: CSSProperties = {
    width: size,
    height: size,
    backgroundColor: color,
    WebkitMaskImage: `url("${src}")`,
    maskImage: `url("${src}")`,
  };
  return <span className="kpi-icon-mask" style={style} aria-hidden />;
}

export function KpiIconBugDev({ size }: I) {
  return <MaskIcon file="bugs.png" color="#2563eb" size={size} />;
}

export function KpiIconBugCliente({ size }: I) {
  return <MaskIcon file="bugs.png" color="#7c3aed" size={size} />;
}

export function KpiIconWarning({ size }: I) {
  return <MaskIcon file="impactados.png" color="#ea580c" size={size} />;
}

export function KpiIconRefresh({ size }: I) {
  return <MaskIcon file="replanejados.png" color="#0284c7" size={size} />;
}

export function KpiIconPlan({ size }: I) {
  return <MaskIcon file="plan.png" color="#0284c7" size={size} />;
}

export function KpiIconReal({ size }: I) {
  return <MaskIcon file="real.png" color="#0284c7" size={size} />;
}

export function KpiIconGap({ size }: I) {
  return <MaskIcon file="gap.png" color="#dc2626" size={size} />;
}
