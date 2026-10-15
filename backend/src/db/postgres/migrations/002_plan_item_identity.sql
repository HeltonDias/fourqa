-- Identidade da agenda. Não altera 001 e não apaga snapshot nem legado.
-- Com suíte: uma linha por (revisão, suite_id). Os pontos ficam em planning_scope_item.
-- Sem suíte: uma linha por (revisão, test_point_id). test_case_id pode repetir entre suítes.
-- Item sem suíte e sem Test Point continua permitido.

ALTER TABLE planning_item ADD COLUMN IF NOT EXISTS test_point_id integer;
ALTER TABLE planning_item ADD COLUMN IF NOT EXISTS test_case_id integer;

CREATE UNIQUE INDEX IF NOT EXISTS uq_plan_item_suite
  ON planning_item (revision_id, suite_id)
  WHERE suite_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_plan_item_point
  ON planning_item (revision_id, test_point_id)
  WHERE suite_id IS NULL AND test_point_id IS NOT NULL;
