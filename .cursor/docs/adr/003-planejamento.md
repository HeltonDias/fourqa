# ADR 003 — A Home ainda usa a data herdada

A Home continua calculando % PLAN com a quantidade de test points do Azure e com as datas herdadas da importação. Datas de uma suíte só são "confirmadas" para essa conta quando existe linha correspondente (`planejamentoOrigem = confirmado`). Se a suíte só herda o período geral do plano, a origem é `periodo_plano`. Sem nenhuma data, a origem é `ausente` e o planejado até hoje fica 0.

O módulo Planejamento segue o ADR 004: baseline confirmado, membership e distribuição por data. Essa página não altera o cálculo da Home.
