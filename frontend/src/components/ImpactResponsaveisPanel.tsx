import type { CSSProperties, ReactNode } from "react";
const impactIcons = import.meta.glob<string>("../../../fonte/util/cenários_impactados/*.png", {
  eager: true,
  query: "?url",
  import: "default",
});

function impactIconUrl(fileName: string): string | undefined {
  const norm = (s: string) => s.normalize("NFC").toLowerCase();
  const target = norm(fileName);
  return Object.entries(impactIcons).find(([p]) => {
    const base = p.split(/[/\\]/).pop() ?? "";
    return norm(base) === target;
  })?.[1];
}

const retesteLoopIcon = impactIconUrl("reteste.png");

type Variant = "total" | "foursys" | "cliente" | "reteste";

function PanelTitleIcon() {
  const src = impactIconUrl("Cenários Impactados Por Responsáveis.png");
  if (!src) return null;
  const mask: CSSProperties = {
    WebkitMaskImage: `url("${src}")`,
    maskImage: `url("${src}")`,
  };
  return <span className="panel-icon panel-icon-mask" style={mask} aria-hidden />;
}

function CardIcon({ variant }: { variant: Variant }) {
  const wrap = (child: ReactNode, className: string) => (
    <span className={`impact-card-icon ${className}`}>{child}</span>
  );

  switch (variant) {
    case "total": {
      const src = impactIconUrl("Cenários Impactados Por Responsáveis.png");
      const mask: CSSProperties | undefined = src
        ? { WebkitMaskImage: `url("${src}")`, maskImage: `url("${src}")` }
        : undefined;
      return wrap(
        <span className="impact-card-img impact-card-img-mask" style={mask} aria-hidden />,
        "icon-total",
      );
    }
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
    case "reteste": {
      const maskStyle: CSSProperties | undefined = retesteLoopIcon
        ? { WebkitMaskImage: `url("${retesteLoopIcon}")`, maskImage: `url("${retesteLoopIcon}")` }
        : undefined;
      return wrap(
        <span
          className="impact-card-img impact-card-img-mask impact-card-img--reteste"
          style={maskStyle}
          aria-hidden
        />,
        "icon-reteste",
      );
    }
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
