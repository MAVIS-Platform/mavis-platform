namespace MAVIS.Worker.Domain.Enums;

/// <summary>
/// Mức độ ảnh hưởng khi một service bị thay đổi.
/// </summary>
public enum ImpactLevel
{
    None = 0,
    Direct = 1,
    Indirect = 2,
    Transitive = 3
}
