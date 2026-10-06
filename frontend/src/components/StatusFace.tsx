import type { CSSProperties } from "react";

const evolucaoIcons = import.meta.glob<string>("../../../fonte/util/evolucoes/*.png", {
  eager: true,
  query: "?url",
  import: "default",
});

export type FaceStatus = "done" | "ok" | "warn" | "risk" | "na";

function evolucaoIconUrl(fileName: string): string | undefined {
  return Object.entries(evolucaoIcons).find(([p]) => p.endsWith(`/${fileName}`))?.[1];
}

const faceIcons: Record<FaceStatus, string | undefined> = {
  done: evolucaoIconUrl("status_finalizado.png"),
  ok: evolucaoIconUrl("status_verde.png"),
  warn: evolucaoIconUrl("status_amarelo.png"),
  risk: evolucaoIconUrl("status_vermelho.png"),
  na: evolucaoIconUrl("status_na.png"),
};

const faceLabel: Record<FaceStatus, string> = {
  done: "Finalizado",
  ok: "No prazo",
  warn: "Atenção",
  risk: "Atrasado",
  na: "Não se aplica",
};

export function StatusFace({
  status,
  large,
  hero,
}: {
  status: FaceStatus;
  large?: boolean;
  hero?: boolean;
}) {
  const cls = ["status-face", large ? "lg" : "", hero ? "hero" : ""].filter(Boolean).join(" ");
  const iconSrc = faceIcons[status];
  if (iconSrc) {
    const mask: CSSProperties = {
      WebkitMaskImage: `url("${iconSrc}")`,
      maskImage: `url("${iconSrc}")`,
    };
    return (
      <span
        className={`${cls} status-face-img face-${status}`}
        style={mask}
        title={faceLabel[status]}
        aria-label={`Status ${faceLabel[status]}`}
      />
    );
  }

  const face = status === "ok" || status === "done" ? "☺" : status === "warn" ? "😐" : status === "na" ? "×" : "☹";
  return (
    <span className={`${cls} face-${status}`} title={faceLabel[status]} aria-label={`Status ${faceLabel[status]}`}>
      {face}
    </span>
  );
}
