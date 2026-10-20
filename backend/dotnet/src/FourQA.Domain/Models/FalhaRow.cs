namespace FourQA.Domain.Models;

public sealed class FalhaRow
{
    public string? PlanKey { get; set; }
    public string? Responsavel { get; set; }
    public int? BugId { get; set; }
    public string? Frente { get; set; }
    public string? Titulo { get; set; }
    public string? Status { get; set; }
    public string? Criacao { get; set; }
    public string? Fechamento { get; set; }
}
