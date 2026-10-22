/** Outra gravação venceu a corrida. HTTP 409. */
export class PlanningConflictError extends Error {
  static readonly cellChanged = "Essa célula foi alterada por outra pessoa. Recarregue e tente novamente.";
  static readonly scheduleChanged = "O planejamento mudou antes da confirmação. Recarregue e tente novamente.";
  static readonly headerChanged = "O cabeçalho foi alterado por outra pessoa. Recarregue e tente novamente.";
  static readonly periodChanged = "O período foi alterado por outra pessoa. Recarregue e tente novamente.";
  static readonly revisionRace =
    "Outra revisão do planejamento foi confirmada ao mesmo tempo. Recarregue e tente novamente.";
  static readonly baselineRevised =
    "O baseline foi revisado enquanto a célula era editada. Recarregue e tente novamente.";
  static readonly itemOutOfRevision = "Item fora da revisão atual. Recarregue e tente novamente.";

  constructor(message: string) {
    super(message);
    this.name = "PlanningConflictError";
  }
}
