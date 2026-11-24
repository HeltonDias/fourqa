package com.fourqa.api.persistence;

public class PlanningConflictError extends RuntimeException {
  public static final String CELL_CHANGED = "Essa célula foi alterada por outra pessoa. Recarregue e tente novamente.";
  public static final String SCHEDULE_CHANGED = "O planejamento mudou antes da confirmação. Recarregue e tente novamente.";
  public static final String HEADER_CHANGED = "O cabeçalho foi alterado por outra pessoa. Recarregue e tente novamente.";
  public static final String PERIOD_CHANGED = "O período foi alterado por outra pessoa. Recarregue e tente novamente.";
  public static final String REVISION_RACE =
      "Outra revisão do planejamento foi confirmada ao mesmo tempo. Recarregue e tente novamente.";
  public static final String BASELINE_REVISED =
      "O baseline foi revisado enquanto a célula era editada. Recarregue e tente novamente.";
  public static final String ITEM_OUT_OF_REVISION = "Item fora da revisão atual. Recarregue e tente novamente.";

  public PlanningConflictError(String message) {
    super(message);
  }
}
