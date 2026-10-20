namespace FourQA.Domain.Models;

/// <summary>Paridade com backend/src/types.ts ExecucaoRow (campos usados pelo domínio).</summary>
public sealed class ExecucaoRow
{
    public string? PlanKey { get; set; }
    public int? SuiteId { get; set; }
    public string? SuiteName { get; set; }
    public string? Responsabilidade { get; set; }
    public string? TestCaseState { get; set; }
    public string? TestPointState { get; set; }
    public string? Outcome { get; set; }
    public string? TestCaseTitle { get; set; }
    public string? TestCaseTags { get; set; }
    public int? LastResultId { get; set; }
}
