-- Aplicada em 2026-10-15 no Supabase de desenvolvimento (fourqa-dev).
-- A role da DATABASE_URL é postgres e tem bypassrls; RLS sem FORCE não a bloqueia.
-- anon, authenticated e PUBLIC não têm privilégio nas tabelas nem nas sequences.
-- Privilégios padrão da role postgres não reabrem tabelas novas para anon/authenticated.
-- Os defaults de supabase_admin não puderam ser alterados (permissão negada).
-- As migrações do FourQA rodam como postgres, então objetos novos ficam sem grant público.
-- Rollback comentado abaixo restaura a exposição anterior. Não executar sem autorização.
-- Não apaga dados e não altera linhas de negócio.

BEGIN;

REVOKE ALL ON TABLE
  public.schema_migrations,
  public.workbook_meta,
  public.planejamento_linhas,
  public.execucoes,
  public.falhas,
  public.planning,
  public.planning_revision,
  public.planning_item,
  public.planning_scope_item,
  public.planning_allocation
FROM anon, authenticated;

REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated;

REVOKE ALL ON TABLE
  public.schema_migrations,
  public.workbook_meta,
  public.planejamento_linhas,
  public.execucoes,
  public.falhas,
  public.planning,
  public.planning_revision,
  public.planning_item,
  public.planning_scope_item,
  public.planning_allocation
FROM PUBLIC;

REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM PUBLIC;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL ON TABLES FROM anon, authenticated, PUBLIC;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL ON SEQUENCES FROM anon, authenticated, PUBLIC;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL ON FUNCTIONS FROM anon, authenticated, PUBLIC;

ALTER TABLE public.schema_migrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workbook_meta ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.planejamento_linhas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.execucoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.falhas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.planning ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.planning_revision ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.planning_item ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.planning_scope_item ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.planning_allocation ENABLE ROW LEVEL SECURITY;

COMMIT;

-- Rollback, se a aplicação passar a usar anon/authenticated ou um grant legítimo sumir:
-- BEGIN;
-- ALTER TABLE public.schema_migrations DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE public.workbook_meta DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE public.planejamento_linhas DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE public.execucoes DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE public.falhas DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE public.planning DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE public.planning_revision DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE public.planning_item DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE public.planning_scope_item DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE public.planning_allocation DISABLE ROW LEVEL SECURITY;
-- GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO anon, authenticated;
-- GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated;
-- COMMIT;
