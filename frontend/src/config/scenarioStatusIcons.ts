import iconBloq from "../../../fonte/util/status_cenarios/BLOQ..png";
import iconPlan from "../../../fonte/util/status_cenarios/CT's PLAN.png";
import iconDesign from "../../../fonte/util/status_cenarios/DESIGN.png";
import iconFalha from "../../../fonte/util/status_cenarios/FALHA.png";
import iconFinal from "../../../fonte/util/status_cenarios/FINALIZADO.png";
import iconLib from "../../../fonte/util/status_cenarios/LIBERADO.png";
import iconTtl from "../../../fonte/util/status_cenarios/TTL CT's.png";
import iconNaoLib from "../../../fonte/util/status_cenarios/NÃO LIBERADO.png";

export type ScenarioIconKey =
  | "ttl"
  | "plan"
  | "final"
  | "falha"
  | "bloq"
  | "lib"
  | "design"
  | "naoLib";

const ICONS: Record<ScenarioIconKey, string> = {
  ttl: iconTtl,
  plan: iconPlan,
  final: iconFinal,
  falha: iconFalha,
  bloq: iconBloq,
  lib: iconLib,
  design: iconDesign,
  naoLib: iconNaoLib,
};

export function getScenarioIconUrl(key: ScenarioIconKey): string {
  return ICONS[key];
}
