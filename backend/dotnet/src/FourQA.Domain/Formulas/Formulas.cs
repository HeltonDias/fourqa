using FourQA.Domain.Models;

namespace FourQA.Domain.Formulas;

/// <summary>Port de backend/src/domain/formulas.ts — manter em sincronia.</summary>
public static class Formulas
{
    public const string DefaultPlanKey = "EndToEnd";

    public sealed class ExecFilter
    {
        public string? PlanKey { get; init; }
        public string? SuiteName { get; init; }
        public object? SuiteId { get; init; }
        public string? TestPointState { get; init; }
        public string? TestCaseState { get; init; }
        public string? Outcome { get; init; }
        public string? Responsabilidade { get; init; }
    }

    public enum StatusCenario
    {
        Passed,
        Na,
        Falhado,
        Bloqueado,
        Design,
        NaoLiberado,
        Liberado,
    }

    public sealed class MetricasPontos
    {
        public int CtsPasseds { get; set; }
        public int CtsNa { get; set; }
        public int CtsFalhados { get; set; }
        public int CtsBloqueados { get; set; }
        public int CtsLiberados { get; set; }
        public int CtsDesign { get; set; }
        public int CtsNaoLiberados { get; set; }
    }

    private static void Bump(MetricasPontos m, StatusCenario s)
    {
        switch (s)
        {
            case StatusCenario.Passed:
                m.CtsPasseds++;
                break;
            case StatusCenario.Na:
                m.CtsNa++;
                break;
            case StatusCenario.Falhado:
                m.CtsFalhados++;
                break;
            case StatusCenario.Bloqueado:
                m.CtsBloqueados++;
                break;
            case StatusCenario.Design:
                m.CtsDesign++;
                break;
            case StatusCenario.NaoLiberado:
                m.CtsNaoLiberados++;
                break;
            case StatusCenario.Liberado:
                m.CtsLiberados++;
                break;
        }
    }

    private static string Norm(string? v) => (v ?? "").Trim();

    public static string EstadoPonto(ExecucaoRow r)
    {
        switch (Norm(r.Outcome).ToLowerInvariant())
        {
            case "passed":
                return "Passed";
            case "failed":
                return "Failed";
            case "blocked":
                return "Blocked";
            case "notapplicable":
                return "Closed";
        }
        var state = Norm(r.TestPointState);
        return state.Equals("ready", StringComparison.OrdinalIgnoreCase) ? "Ready" : state.Length > 0 ? "Unspecified" : "";
    }

    private static bool MatchContains(string haystack, string needle) =>
        haystack.Contains(needle, StringComparison.OrdinalIgnoreCase);

    public static int CountExecucoes(IReadOnlyList<ExecucaoRow> rows, ExecFilter f)
    {
        return rows.Count(r =>
        {
            if (f.PlanKey != null && Norm(r.PlanKey) != f.PlanKey) return false;
            if (f.SuiteName != null && Norm(r.SuiteName) != Norm(f.SuiteName)) return false;
            if (f.SuiteId != null && Convert.ToString(r.SuiteId) != Convert.ToString(f.SuiteId)) return false;
            if (f.TestPointState != null && EstadoPonto(r) != f.TestPointState) return false;
            if (f.TestCaseState != null && Norm(r.TestCaseState) != f.TestCaseState) return false;
            if (f.Outcome != null && Norm(r.Outcome) != f.Outcome) return false;
            if (f.Responsabilidade != null && Norm(r.Responsabilidade) != f.Responsabilidade) return false;
            return true;
        });
    }

    public static MetricasPontos MetricasPorProcesso(IReadOnlyList<ExecucaoRow> execRows, string planKey, string processo)
    {
        var outM = new MetricasPontos();
        if (string.IsNullOrEmpty(processo)) return outM;

        foreach (var r in execRows)
        {
            if (Norm(r.PlanKey) != planKey || Norm(r.SuiteName) != Norm(processo)) continue;
            Bump(outM, ClassifyExecution(r));
        }
        return outM;
    }

    public static StatusCenario ClassifyExecution(ExecucaoRow r)
    {
        var ponto = EstadoPonto(r);
        if (ponto == "Passed") return StatusCenario.Passed;
        if (ponto == "Closed") return StatusCenario.Na;
        if (ponto == "Failed") return StatusCenario.Falhado;
        if (ponto == "Blocked") return StatusCenario.Bloqueado;
        var tc = Norm(r.TestCaseState).ToLowerInvariant();
        if (tc == "design") return StatusCenario.Design;
        if (tc == "não atribuído" || tc == "nao atribuido") return StatusCenario.NaoLiberado;
        return ponto == "Ready" ? StatusCenario.Liberado : StatusCenario.NaoLiberado;
    }

    public static StatusCenario StatusCenario(ExecucaoRow r) => ClassifyExecution(r);

    public static MetricasPontos MetricasDosPontos(IReadOnlyList<ExecucaoRow> rows)
    {
        var outM = new MetricasPontos();
        foreach (var r in rows) Bump(outM, ClassifyExecution(r));
        return outM;
    }

    public static int TotalRealizadoLinha(MetricasPontos metrics) => metrics.CtsPasseds + metrics.CtsNa;

    public static int FinalizadosComCancelados(MetricasPontos metrics, int ctsCancelados) =>
        metrics.CtsPasseds + metrics.CtsNa + ctsCancelados;

    public static int ImpactoTotalTestPoint(IReadOnlyList<ExecucaoRow> execRows, string planKey) =>
        CountExecucoes(execRows, new ExecFilter { PlanKey = planKey, TestPointState = "Failed" }) +
        CountExecucoes(execRows, new ExecFilter { PlanKey = planKey, TestPointState = "Blocked" });

    private static bool IsOpenBugStatus(string status)
    {
        var s = status.ToLowerInvariant();
        return s == "new" || s == "active";
    }

    public sealed class ImpactosKpi
    {
        public int Foursys { get; set; }
        public int Cliente { get; set; }
        public int Reteste { get; set; }
    }

    public static ImpactosKpi ClassificarImpactosKpi(
        IReadOnlyList<ExecucaoRow> execRows,
        IReadOnlyList<FalhaRow> falhas,
        string planKey)
    {
        var planFalhas = falhas.Where(f => Norm(f.PlanKey) == planKey).ToList();
        var result = new ImpactosKpi();

        var cenarios = execRows.Where(r =>
            Norm(r.PlanKey) == planKey &&
            (Norm(r.Outcome).Equals("failed", StringComparison.OrdinalIgnoreCase) ||
             Norm(r.Outcome).Equals("blocked", StringComparison.OrdinalIgnoreCase))).ToList();

        foreach (var c in cenarios)
        {
            var tags = Norm(c.TestCaseTags);
            var classified = false;
            foreach (var f in planFalhas)
            {
                if (f.BugId == null) continue;
                if (!IsOpenBugStatus(Norm(f.Status))) continue;
                var frenteMatch = tags.Length > 0 && f.Frente != null && MatchContains(tags, Norm(f.Frente));
                var titleHead = Norm(c.TestCaseTitle);
                if (titleHead.Length > 20) titleHead = titleHead[..20];
                var tituloMatch = titleHead.Length > 0 && f.Titulo != null &&
                                  MatchContains(Norm(f.Titulo), titleHead);
                if (!frenteMatch && !tituloMatch) continue;
                var resp = Norm(f.Responsavel);
                if (resp.Contains("Foursys", StringComparison.OrdinalIgnoreCase))
                {
                    result.Foursys++;
                    classified = true;
                    break;
                }
                if (resp.Contains("Cliente", StringComparison.OrdinalIgnoreCase) ||
                    resp.Contains("CVP", StringComparison.OrdinalIgnoreCase))
                {
                    result.Cliente++;
                    classified = true;
                    break;
                }
            }
            if (!classified) result.Reteste++;
        }

        return result;
    }

    public sealed class FalhaFilter
    {
        public required string PlanKey { get; init; }
        public string? FrenteContains { get; init; }
        public string? Responsavel { get; init; }
        public string? Status { get; init; }
        public string? StatusNot { get; init; }
        public bool FechamentoEmpty { get; init; }
        public bool FechamentoNotEmpty { get; init; }
        public bool CriacaoEmpty { get; init; }
        public bool IdNotEmpty { get; init; }
    }

    public static int CountFalhas(IReadOnlyList<FalhaRow> rows, FalhaFilter f)
    {
        return rows.Count(r =>
        {
            if (Norm(r.PlanKey) != f.PlanKey) return false;
            if (f.FrenteContains != null && !MatchContains(Norm(r.Frente), f.FrenteContains)) return false;
            if (f.Responsavel != null && Norm(r.Responsavel) != f.Responsavel) return false;
            if (f.Status != null && Norm(r.Status) != f.Status) return false;
            if (f.StatusNot != null && Norm(r.Status) == f.StatusNot) return false;
            if (f.FechamentoEmpty && Norm(r.Fechamento) != "") return false;
            if (f.FechamentoNotEmpty && Norm(r.Fechamento) == "") return false;
            if (f.CriacaoEmpty && Norm(r.Criacao) != "") return false;
            if (f.IdNotEmpty && (r.BugId == null || r.BugId == 0)) return false;
            return true;
        });
    }

    public static double SumifFrente<T>(IReadOnlyList<T> rows, string frenteNeedle, Func<T, string?> frenteSelector, Func<T, object?> fieldSelector)
    {
        double sum = 0;
        foreach (var row in rows)
        {
            if (!MatchContains(Norm(frenteSelector(row)), frenteNeedle)) continue;
            var v = fieldSelector(row);
            sum += v switch
            {
                int i => i,
                long l => l,
                double d => d,
                float fl => fl,
                decimal dec => (double)dec,
                string s => double.TryParse(s, out var n) ? n : 0,
                _ => 0,
            };
        }
        return sum;
    }
}
