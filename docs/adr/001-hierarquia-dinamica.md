# ADR 001 — A hierarquia do Test Plan é dinâmica

A árvore do Azure não tem um nível fixo para Frente, Prioridade ou Processo. O sync guarda o caminho da suíte (`suite_path`, pai, profundidade) e detecta dimensões.

Semântica (Prioridade, Frente, …) entra com confiança alta. Se não houver confiança, o rótulo é "Nível N". Override manual em `SYNC_HIERARQUIA_SUITES` vence a detecção, mesmo com confiança 1.

A lista `SYNC_FRENTES_VALIDAS` é dica do projeto para tags e para reconhecer um nível, não uma regra universal de posição.
