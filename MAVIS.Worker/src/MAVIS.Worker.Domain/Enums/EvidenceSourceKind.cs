namespace MAVIS.Worker.Domain.Enums;

/// <summary>
/// Loại nguồn phát hiện (evidence) - giúp trace lại từ graph về source code.
/// </summary>
public enum EvidenceSourceKind
{
    Unknown = 0,
    SourceFile = 1,
    DockerCompose = 2,
    ApplicationConfig = 3,
    EnvironmentFile = 4
}
