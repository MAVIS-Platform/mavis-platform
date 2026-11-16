namespace MAVIS.Worker.Domain.Enums;

/// <summary>
/// Loại dependency được phát hiện giữa hai service.
/// </summary>
public enum DependencyKind
{
    Unknown = 0,
    HttpRestCall = 1,
    ConfigurationReference = 2,
    EnvironmentVariableReference = 3,
    DockerNetworkReference = 4
}
