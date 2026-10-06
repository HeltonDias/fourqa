import type { ReactNode } from "react";
import tituloCenariosImpactados from "../../../fonte/util/cenários_impactados/Cenários Impactados Por Responsáveis.png";
import retestePng from "../../../fonte/util/cenários_impactados/reteste.png";
import { iconMaskStyle } from "../utils/iconMask";

const TITULO_ICON_URL = tituloCenariosImpactados;
const RETESTE_ICON_URL = retestePng;

type Variant = "total" | "foursys" | "cliente" | "reteste";

function PanelTitleIcon() {
  return (
    <span
      className="panel-icon panel-icon-mask"
      style={iconMaskStyle(TITULO_ICON_URL)}
      aria-hidden
    />
  );
}

function CardIcon({ variant }: { variant: Variant }) {
  const wrap = (child: ReactNode, className: string) => (
    <span className={`impact-card-icon ${className}`}>{child}</span>
  );

  switch (variant) {
    case "total":
      return wrap(
        <span
          className="impact-card-img impact-card-img-mask"
          style={iconMaskStyle(TITULO_ICON_URL)}
          aria-hidden
        />,
        "icon-total",
      );
    case "foursys":
      return wrap(
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
          <rect x="6" y="4" width="12" height="16" rx="1" stroke="currentColor" strokeWidth="1.5" />
          <path d="M9 8h2M13 8h2M9 11h2M13 11h2M9 14h6" stroke="currentColor" strokeWidth="1.4" />
        </svg>,
        "icon-foursys",
      );
    case "cliente":
      return wrap(
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
          <circle cx="12" cy="8" r="3" stroke="currentColor" strokeWidth="1.5" />
          <path d="M6 19c0-3 2.7-5 6-5s6 2 6 5" stroke="currentColor" strokeWidth="1.5" />
        </svg>,
        "icon-cliente",
      );
    case "reteste":
      return wrap(
        <span
          className="impact-card-img impact-card-img-mask impact-card-img--reteste"
          style={iconMaskStyle(RETESTE_ICON_URL)}
          aria-hidden
        />,
        "icon-reteste",
      );
  }
}

function ImpactCard({
  variant,
  label,
  value,
}: {
  variant: Variant;
  label: string;
  value: number;
}) {
  return (
    <div className={`impact-card impact-card--${variant}`}>
      <CardIcon variant={variant} />
      <div className="impact-card-body">
        <span className="impact-card-label">{label}</span>
        <div className="impact-card-value">{value}</div>
      </div>
    </div>
  );
}

type Props = {
  total: number;
  foursys: number;
  cliente: number;
  reteste: number;
};

export function ImpactResponsaveisPanel({ total, foursys, cliente, reteste }: Props) {
  return (
    <div className="card impact-panel">
      <h2 className="impact-panel-title">
        <PanelTitleIcon />
        Cenários Impactados Por Responsáveis
      </h2>
      <div className="impact-grid">
        <ImpactCard variant="foursys" label="Foursys" value={foursys} />
        <ImpactCard variant="cliente" label="Cliente" value={cliente} />
        <ImpactCard variant="reteste" label="Reteste" value={reteste} />
        <ImpactCard variant="total" label="Total" value={total} />
      </div>
    </div>
  );
}
