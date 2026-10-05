/** PNGs em fonte/util/status_cenarios (nomes com acento/apóstrofo). */
const modules = import.meta.glob<string>("../../../fonte/util/status_cenarios/*.png", {
  eager: true,
  import: "default",
});

function pickIcon(match: (path: string) => boolean): string {
  const hit = Object.entries(modules).find(([path]) => match(path.toLowerCase()));
  return hit?.[1] ?? "";
}

export const statusCenarioIcons = {
  ttl: pickIcon((p) => p.includes("ttl ct")),
  plan: pickIcon((p) => p.includes("ct's plan") || p.includes("cts plan")),
  finalizado: pickIcon((p) => p.includes("finalizado")),
  falha: pickIcon((p) => p.includes("falha")),
  bloq: pickIcon((p) => p.includes("bloq")),
  liberado: pickIcon((p) => /liberado\.png$/i.test(p) && !/n.o\s*liberado/i.test(p)),
  design: pickIcon((p) => p.includes("design")),
  naoLiberado: pickIcon((p) => /n.o\s*liberado/i.test(p)),
};

export type ScenarioStatusKey =
  | "ttl"
  | "plan"
  | "finalizado"
  | "falha"
  | "bloq"
  | "liberado"
  | "design"
  | "naoLiberado";

export const scenarioStatusTheme: Record<
  ScenarioStatusKey,
  {
    label: string;
    card: string;
    icon: string;
    iconTint: string;
    labelColor: string;
  }
> = {
  ttl: {
    label: "TTL CT's",
    card: "scenario-card--ttl",
    icon: "scenario-icon--ttl",
    iconTint: "#ffffff",
    labelColor: "#334155",
  },
  plan: {
    label: "CT's PLAN",
    card: "scenario-card--plan",
    icon: "scenario-icon--plan",
    iconTint: "#ffffff",
    labelColor: "#334155",
  },
  finalizado: {
    label: "FINAL.",
    card: "scenario-card--final",
    icon: "scenario-icon--final",
    iconTint: "#ffffff",
    labelColor: "#334155",
  },
  falha: {
    label: "FALHA",
    card: "scenario-card--falha",
    icon: "scenario-icon--falha",
    iconTint: "#ffffff",
    labelColor: "#334155",
  },
  bloq: {
    label: "BLOQ.",
    card: "scenario-card--bloq",
    icon: "scenario-icon--bloq",
    iconTint: "#ffffff",
    labelColor: "#334155",
  },
  liberado: {
    label: "LIB.",
    card: "scenario-card--lib",
    icon: "scenario-icon--lib",
    iconTint: "#ffffff",
    labelColor: "#334155",
  },
  design: {
    label: "DESIGN",
    card: "scenario-card--design",
    icon: "scenario-icon--design",
    iconTint: "#ffffff",
    labelColor: "#334155",
  },
  naoLiberado: {
    label: "NÃO LIB.",
    card: "scenario-card--naolib",
    icon: "scenario-icon--naolib",
    iconTint: "#ffffff",
    labelColor: "#334155",
  },
};
