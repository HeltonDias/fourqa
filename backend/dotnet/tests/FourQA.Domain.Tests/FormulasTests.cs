using FourQA.Domain.Formulas;
using FourQA.Domain.Models;
using Xunit;
using static FourQA.Domain.Formulas.Formulas;

namespace FourQA.Domain.Tests;

/// <summary>Espelha backend/src/domain/formulas.test.ts</summary>
public class FormulasTests
{
    private static ExecucaoRow Row(string outcome, string testCaseState = "", string testPointState = "") =>
        new()
        {
            Outcome = outcome,
            TestCaseState = testCaseState,
            TestPointState = testPointState,
        };

    [Fact]
    public void Passed_conta_como_passed_mesmo_com_Test_Case_Closed_QA_Ressalva_ou_UAT()
    {
        foreach (var state in new[] { "Closed", "QA", "Ressalva", "UAT", "BUG" })
        {
            Assert.Equal(StatusCenario.Passed, ClassifyExecution(Row("Passed", state, "Completed")));
        }
    }

    [Fact]
    public void NotApplicable_vira_NA()
    {
        Assert.Equal(StatusCenario.Na, ClassifyExecution(Row("NotApplicable", "Closed")));
    }

    [Fact]
    public void Failed_e_Blocked_ignoram_estado_do_Test_Case()
    {
        Assert.Equal(StatusCenario.Falhado, ClassifyExecution(Row("Failed", "BUG")));
        Assert.Equal(StatusCenario.Bloqueado, ClassifyExecution(Row("Blocked", "QA")));
    }

    [Fact]
    public void Sem_execucao_Design_Nao_atribuido_Ready_e_o_resto()
    {
        Assert.Equal(StatusCenario.Design, ClassifyExecution(Row("", "Design", "NotReady")));
        Assert.Equal(StatusCenario.NaoLiberado, ClassifyExecution(Row("", "Não atribuído", "NotReady")));
        Assert.Equal(StatusCenario.Liberado, ClassifyExecution(Row("", "QA", "Ready")));
        Assert.Equal(StatusCenario.NaoLiberado, ClassifyExecution(Row("", "QA", "NotReady")));
    }

    [Fact]
    public void Soma_das_colunas_fecha_com_o_total()
    {
        var casos = new[]
        {
            Row("Passed", "Closed"),
            Row("Passed", "QA"),
            Row("NotApplicable"),
            Row("Failed", "BUG"),
            Row("Blocked"),
            Row("", "Design"),
            Row("", "QA", "Ready"),
            Row("", "QA", "NotReady"),
        };
        var buckets = new Dictionary<StatusCenario, int>();
        foreach (var c in casos)
        {
            var k = ClassifyExecution(c);
            buckets[k] = buckets.GetValueOrDefault(k) + 1;
        }
        Assert.Equal(casos.Length, buckets.Values.Sum());
    }

    private static ExecucaoRow Ponto(string outcome, string testCaseState = "", string testPointState = "") =>
        Row(outcome, testCaseState, testPointState);

    [Fact]
    public void Report_soma_so_Passed_e_NA_mesmo_com_cancelados_legados()
    {
        var mistos = new[]
        {
            Ponto("Passed", "Closed"),
            Ponto("Passed", "QA"),
            Ponto("NotApplicable"),
            Ponto("Failed", "BUG"),
            Ponto("Blocked"),
            Ponto("", "Design"),
            Ponto("", "QA", "Ready"),
            Ponto("", "QA", "NotReady"),
        };
        var metrics = MetricasDosPontos(mistos);
        Assert.Equal(3, TotalRealizadoLinha(metrics));
        Assert.Equal(
            mistos.Length,
            metrics.CtsPasseds + metrics.CtsNa + metrics.CtsFalhados + metrics.CtsBloqueados +
            metrics.CtsLiberados + metrics.CtsDesign + metrics.CtsNaoLiberados);
    }

    [Fact]
    public void Pendentes_e_complemento_e_cancelados_nao_entram_na_particao()
    {
        var mistos = new[]
        {
            Ponto("Passed", "Closed"),
            Ponto("Passed", "QA"),
            Ponto("NotApplicable"),
            Ponto("Failed", "BUG"),
            Ponto("Blocked"),
            Ponto("", "Design"),
            Ponto("", "QA", "Ready"),
            Ponto("", "QA", "NotReady"),
        };
        var metrics = MetricasDosPontos(mistos);
        var total = mistos.Length;
        var finalizados = TotalRealizadoLinha(metrics);
        var pendentes = total - finalizados;
        Assert.Equal(
            metrics.CtsFalhados + metrics.CtsBloqueados + metrics.CtsLiberados + metrics.CtsNaoLiberados + metrics.CtsDesign,
            pendentes);
        Assert.Equal(total, finalizados + pendentes);
    }

    [Fact]
    public void Aba_Status_soma_cancelados_legados()
    {
        var metrics = MetricasDosPontos(new[] { Ponto("Passed"), Ponto("NotApplicable") });
        Assert.Equal(6, FinalizadosComCancelados(metrics, 4));
        Assert.Equal(2, TotalRealizadoLinha(metrics));
        Assert.Equal(2, FinalizadosComCancelados(metrics, 0));
    }
}
