-- Preenchimento próprio da suíte. Não altera 001 nem 002.
-- Nulo é válido. Não cria unicidade nova e não mexe em execucoes ou falhas.

ALTER TABLE planning_item ADD COLUMN IF NOT EXISTS responsavel text;
ALTER TABLE planning_item ADD COLUMN IF NOT EXISTS prioridade text;
