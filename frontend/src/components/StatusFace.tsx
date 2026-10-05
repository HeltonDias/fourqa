import type { CSSProperties } from "react";

const evolucaoIcons = import.meta.glob<string>("../../../fonte/util/evolucoes/*.png", {
  eager: true,
  query: "?url",
  import: "default",
});

function evolucaoIconUrl(fileName: string): string | undefined {
  return Object.entries(evolucaoIcons).find(([p]) => p.endsWith(`/${fileName}`))?.[1];
}

/** Ícones de rosto por status (tabela). Sem arquivo => fallback para o círculo com caractere. */
const faceIcons: Record<"ok" | "warn" | "risk", string | undefined> = {
  ok: evolucaoIconUrl("status_verdee.png"),
  warn: undefined,
  risk: undefined,
};

function HeroFaceGraphic({ status }: { status: "ok" | "warn" | "risk" }) {
  const mouth =
    status === "ok" ? (
      <path
        d="M14 28 Q24 38 34 28"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
    ) : status === "warn" ? (
      <path d="M14 32 H34" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
    ) : (
      <path
        d="M14 34 Q24 26 34 34"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
    );

  return (
    <svg className="hero-face-svg" viewBox="0 0 48 48" aria-hidden>
      <circle cx="24" cy="24" r="19" fill="none" stroke="currentColor" strokeWidth="2" />
      <circle cx="17.5" cy="20" r="2.4" fill="currentColor" />
      <circle cx="30.5" cy="20" r="2.4" fill="currentColor" />
      {mouth}
    </svg>
  );
}

export function StatusFace({
  status,
  large,
  hero,
}: {
  status: "ok" | "warn" | "risk";
  large?: boolean;
  /** Círculo grande no card STATUS (mock planilha) */
  hero?: boolean;
}) {
  if (hero) {
    return (
      <span
        className={`status-face hero face-${status}`}
        title={status}
        aria-label={`Status ${status}`}
      >
        <HeroFaceGraphic status={status} />
      </span>
    );
  }

  const cls = large ? "status-face lg" : "status-face";
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
        title={status}
        aria-label={`Status ${status}`}
      />
    );
  }

  const face = status === "ok" ? "☺" : status === "warn" ? "😐" : "☹";
  return (
    <span className={`${cls} face-${status}`} title={status} aria-label={`Status ${status}`}>
      {face}
    </span>
  );
}
