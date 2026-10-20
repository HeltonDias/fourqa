using System.Text.Json;
using System.Text.Json.Serialization;
using FourQA.Domain.Formulas;
using FourQA.Domain.Models;
using Xunit;
using static FourQA.Domain.Formulas.Formulas;

namespace FourQA.Domain.Tests;

/// <summary>Paridade com backend/shared/formulas-parity-vectors.json (gerado de formulas.ts).</summary>
public class FormulasParityVectorsTests
{
    private static readonly JsonSerializerOptions JsonOpts = new() { PropertyNameCaseInsensitive = true };

    private static ParityVectors Load()
    {
        var path = Path.Combine(AppContext.BaseDirectory, "fixtures", "formulas-parity-vectors.json");
        var json = File.ReadAllText(path);
        return JsonSerializer.Deserialize<ParityVectors>(json, JsonOpts)
               ?? throw new InvalidOperationException("vectors JSON inválido");
    }

    [Fact]
    public void Vectors_estadoPonto_e_classify()
    {
        var v = Load();
        foreach (var c in v.EstadoPonto)
        {
            Assert.Equal(c.Expected, EstadoPonto(new ExecucaoRow { Outcome = c.Outcome, TestPointState = c.TestPointState }));
        }
        foreach (var c in v.ClassifyExecution)
        {
            Assert.Equal(c.Expected, ToTsKey(ClassifyExecution(MapRow(c))));
        }
    }

    [Fact]
    public void Vectors_agregacoes_e_kpi()
    {
        var v = Load();
        Assert.Equal(
            v.CountExecucoes.Expected,
            CountExecucoes(MapRows(v.CountExecucoes.Rows), MapFilter(v.CountExecucoes.Filter)));

        var mProc = MetricasPorProcesso(
            MapRows(v.MetricasPorProcesso.Rows),
            v.MetricasPorProcesso.PlanKey,
            v.MetricasPorProcesso.Processo);
        AssertMetricas(v.MetricasPorProcesso.Expected, mProc);

        var mEmpty = MetricasPorProcesso(
            MapRows(v.MetricasPorProcessoEmpty.Rows),
            v.MetricasPorProcessoEmpty.PlanKey,
            v.MetricasPorProcessoEmpty.Processo);
        AssertMetricas(v.MetricasPorProcessoEmpty.Expected, mEmpty);

        Assert.Equal(v.TotalRealizadoLinha.Expected, TotalRealizadoLinha(MapMetricas(v.TotalRealizadoLinha.Metrics)));
        Assert.Equal(
            v.FinalizadosComCancelados.Expected,
            FinalizadosComCancelados(MapMetricas(v.FinalizadosComCancelados.Metrics), v.FinalizadosComCancelados.Cancelados));

        Assert.Equal(
            v.ImpactoTotalTestPoint.Expected,
            ImpactoTotalTestPoint(MapRows(v.ImpactoTotalTestPoint.Rows), v.ImpactoTotalTestPoint.PlanKey));

        var kpi = ClassificarImpactosKpi(
            MapRows(v.ClassificarImpactosKpi.ExecRows),
            MapFalhas(v.ClassificarImpactosKpi.FalhaRows),
            v.ClassificarImpactosKpi.PlanKey);
        Assert.Equal(v.ClassificarImpactosKpi.Expected.Foursys, kpi.Foursys);
        Assert.Equal(v.ClassificarImpactosKpi.Expected.Cliente, kpi.Cliente);
        Assert.Equal(v.ClassificarImpactosKpi.Expected.Reteste, kpi.Reteste);

        Assert.Equal(
            v.CountFalhas.Expected,
            CountFalhas(MapFalhas(v.CountFalhas.Rows), MapFalhaFilter(v.CountFalhas.Filter)));

        var sumRows = v.SumifFrente.Rows.Select(r => (r.Frente, r.Pts)).ToList();
        Assert.Equal(
            v.SumifFrente.Expected,
            SumifFrente(sumRows, v.SumifFrente.Needle, x => x.Frente, x => x.Pts));
    }

    private static void AssertMetricas(MetricasDto expected, MetricasPontos actual)
    {
        Assert.Equal(expected.CtsPasseds, actual.CtsPasseds);
        Assert.Equal(expected.CtsNa, actual.CtsNa);
        Assert.Equal(expected.CtsFalhados, actual.CtsFalhados);
        Assert.Equal(expected.CtsBloqueados, actual.CtsBloqueados);
        Assert.Equal(expected.CtsLiberados, actual.CtsLiberados);
        Assert.Equal(expected.CtsDesign, actual.CtsDesign);
        Assert.Equal(expected.CtsNaoLiberados, actual.CtsNaoLiberados);
    }

    private static string ToTsKey(StatusCenario s) => s switch
    {
        StatusCenario.Passed => "passed",
        StatusCenario.Na => "na",
        StatusCenario.Falhado => "falhado",
        StatusCenario.Bloqueado => "bloqueado",
        StatusCenario.Design => "design",
        StatusCenario.NaoLiberado => "naoLiberado",
        StatusCenario.Liberado => "liberado",
        _ => throw new ArgumentOutOfRangeException(nameof(s)),
    };

    private static ExecucaoRow MapRow(ClassifyCase c) => new()
    {
        Outcome = c.Outcome,
        TestCaseState = c.TestCaseState,
        TestPointState = c.TestPointState,
    };

    private static List<ExecucaoRow> MapRows(List<ExecRowDto> rows) =>
        rows.Select(r => new ExecucaoRow
        {
            PlanKey = r.PlanKey,
            SuiteId = r.SuiteId,
            SuiteName = r.SuiteName,
            Responsabilidade = r.Responsabilidade,
            TestCaseState = r.TestCaseState,
            TestPointState = r.TestPointState,
            Outcome = r.Outcome,
            TestCaseTitle = r.TestCaseTitle,
            TestCaseTags = r.TestCaseTags,
            LastResultId = r.LastResultId,
        }).ToList();

    private static List<FalhaRow> MapFalhas(List<FalhaDto> rows) =>
        rows.Select(f => new FalhaRow
        {
            PlanKey = f.PlanKey,
            Responsavel = f.Responsavel,
            BugId = f.BugId,
            Frente = f.Frente,
            Titulo = f.Titulo,
            Status = f.Status,
            Criacao = f.Criacao,
            Fechamento = f.Fechamento,
        }).ToList();

    private static ExecFilter MapFilter(ExecFilterDto f) => new()
    {
        PlanKey = f.PlanKey,
        SuiteName = f.SuiteName,
        SuiteId = f.SuiteId,
        TestPointState = f.TestPointState,
        TestCaseState = f.TestCaseState,
        Outcome = f.Outcome,
        Responsabilidade = f.Responsabilidade,
    };

    private static FalhaFilter MapFalhaFilter(FalhaFilterDto f) => new()
    {
        PlanKey = f.PlanKey ?? "EndToEnd",
        FrenteContains = f.FrenteContains,
        Responsavel = f.Responsavel,
        Status = f.Status,
        StatusNot = f.StatusNot,
        FechamentoEmpty = f.FechamentoEmpty,
        FechamentoNotEmpty = f.FechamentoNotEmpty,
        CriacaoEmpty = f.CriacaoEmpty,
        IdNotEmpty = f.IdNotEmpty,
    };

    private static MetricasPontos MapMetricas(MetricasDto m) => new()
    {
        CtsPasseds = m.CtsPasseds,
        CtsNa = m.CtsNa,
        CtsFalhados = m.CtsFalhados,
        CtsBloqueados = m.CtsBloqueados,
        CtsLiberados = m.CtsLiberados,
        CtsDesign = m.CtsDesign,
        CtsNaoLiberados = m.CtsNaoLiberados,
    };

    private sealed class ParityVectors
    {
        public List<EstadoPontoCase> EstadoPonto { get; set; } = [];
        public List<ClassifyCase> ClassifyExecution { get; set; } = [];
        public CountExecCase CountExecucoes { get; set; } = new();
        public MetricasPorProcessoCase MetricasPorProcesso { get; set; } = new();
        public MetricasPorProcessoCase MetricasPorProcessoEmpty { get; set; } = new();
        public TotalRealizadoCase TotalRealizadoLinha { get; set; } = new();
        public FinalizadosCase FinalizadosComCancelados { get; set; } = new();
        public ImpactoCase ImpactoTotalTestPoint { get; set; } = new();
        public KpiCase ClassificarImpactosKpi { get; set; } = new();
        public CountFalhasCase CountFalhas { get; set; } = new();
        public SumifCase SumifFrente { get; set; } = new();
    }

    private sealed class EstadoPontoCase
    {
        public string Outcome { get; set; } = "";
        [JsonPropertyName("test_point_state")]
        public string TestPointState { get; set; } = "";
        public string Expected { get; set; } = "";
    }

    private sealed class ClassifyCase
    {
        public string Outcome { get; set; } = "";
        [JsonPropertyName("test_case_state")]
        public string TestCaseState { get; set; } = "";
        [JsonPropertyName("test_point_state")]
        public string TestPointState { get; set; } = "";
        public string Expected { get; set; } = "";
    }

    private sealed class ExecRowDto
    {
        [JsonPropertyName("plan_key")]
        public string? PlanKey { get; set; }
        [JsonPropertyName("suite_id")]
        public int? SuiteId { get; set; }
        [JsonPropertyName("suite_name")]
        public string? SuiteName { get; set; }
        public string? Responsabilidade { get; set; }
        [JsonPropertyName("test_case_state")]
        public string? TestCaseState { get; set; }
        [JsonPropertyName("test_point_state")]
        public string? TestPointState { get; set; }
        public string? Outcome { get; set; }
        [JsonPropertyName("test_case_title")]
        public string? TestCaseTitle { get; set; }
        [JsonPropertyName("test_case_tags")]
        public string? TestCaseTags { get; set; }
        [JsonPropertyName("last_result_id")]
        public int? LastResultId { get; set; }
    }

    private sealed class FalhaDto
    {
        [JsonPropertyName("plan_key")]
        public string? PlanKey { get; set; }
        public string? Responsavel { get; set; }
        [JsonPropertyName("bug_id")]
        public int? BugId { get; set; }
        public string? Frente { get; set; }
        public string? Titulo { get; set; }
        public string? Status { get; set; }
        public string? Criacao { get; set; }
        public string? Fechamento { get; set; }
    }

    private sealed class ExecFilterDto
    {
        public string? PlanKey { get; set; }
        public string? SuiteName { get; set; }
        public object? SuiteId { get; set; }
        public string? TestPointState { get; set; }
        public string? TestCaseState { get; set; }
        public string? Outcome { get; set; }
        public string? Responsabilidade { get; set; }
    }

    private sealed class FalhaFilterDto
    {
        public string? PlanKey { get; set; }
        public string? FrenteContains { get; set; }
        public string? Responsavel { get; set; }
        public string? Status { get; set; }
        public string? StatusNot { get; set; }
        public bool FechamentoEmpty { get; set; }
        public bool FechamentoNotEmpty { get; set; }
        public bool CriacaoEmpty { get; set; }
        public bool IdNotEmpty { get; set; }
    }

    private sealed class MetricasDto
    {
        [JsonPropertyName("cts_passeds")]
        public int CtsPasseds { get; set; }
        [JsonPropertyName("cts_na")]
        public int CtsNa { get; set; }
        [JsonPropertyName("cts_falhados")]
        public int CtsFalhados { get; set; }
        [JsonPropertyName("cts_bloqueados")]
        public int CtsBloqueados { get; set; }
        [JsonPropertyName("cts_liberados")]
        public int CtsLiberados { get; set; }
        [JsonPropertyName("cts_design")]
        public int CtsDesign { get; set; }
        [JsonPropertyName("cts_nao_liberados")]
        public int CtsNaoLiberados { get; set; }
    }

    private sealed class CountExecCase
    {
        public List<ExecRowDto> Rows { get; set; } = [];
        public ExecFilterDto Filter { get; set; } = new();
        public int Expected { get; set; }
    }

    private sealed class MetricasPorProcessoCase
    {
        public List<ExecRowDto> Rows { get; set; } = [];
        [JsonPropertyName("planKey")]
        public string PlanKey { get; set; } = "";
        public string Processo { get; set; } = "";
        public MetricasDto Expected { get; set; } = new();
    }

    private sealed class TotalRealizadoCase
    {
        public MetricasDto Metrics { get; set; } = new();
        public int Expected { get; set; }
    }

    private sealed class FinalizadosCase
    {
        public MetricasDto Metrics { get; set; } = new();
        public int Cancelados { get; set; }
        public int Expected { get; set; }
    }

    private sealed class ImpactoCase
    {
        public List<ExecRowDto> Rows { get; set; } = [];
        [JsonPropertyName("planKey")]
        public string PlanKey { get; set; } = "";
        public int Expected { get; set; }
    }

    private sealed class KpiCase
    {
        [JsonPropertyName("execRows")]
        public List<ExecRowDto> ExecRows { get; set; } = [];
        [JsonPropertyName("falhaRows")]
        public List<FalhaDto> FalhaRows { get; set; } = [];
        [JsonPropertyName("planKey")]
        public string PlanKey { get; set; } = "";
        public KpiDto Expected { get; set; } = new();
    }

    private sealed class KpiDto
    {
        public int Foursys { get; set; }
        public int Cliente { get; set; }
        public int Reteste { get; set; }
    }

    private sealed class CountFalhasCase
    {
        public List<FalhaDto> Rows { get; set; } = [];
        public FalhaFilterDto Filter { get; set; } = new();
        public int Expected { get; set; }
    }

    private sealed class SumifCase
    {
        public List<SumifRowDto> Rows { get; set; } = [];
        public string Needle { get; set; } = "";
        public double Expected { get; set; }
    }

    private sealed class SumifRowDto
    {
        public string Frente { get; set; } = "";
        public int Pts { get; set; }
    }
}
