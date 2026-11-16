using System.Text.Json;
using System.Text.Json.Serialization;

namespace MAVIS.Runner;

public static class RuntimeDefinitionReader
{
    private static readonly JsonSerializerOptions Options = new(RuntimeLifecycleJournal.Json)
    {
        UnmappedMemberHandling = JsonUnmappedMemberHandling.Disallow
    };

    public static RuntimeRunDefinition Read(string json, string? expectedSessionId = null)
    {
        if (System.Text.Encoding.UTF8.GetByteCount(json) > 1_048_576) throw new ArgumentException("Definition exceeds budget.");
        using var document = JsonDocument.Parse(json);
        var root = JavaRuntimeClient.Data(document.RootElement);
        var definition = root.Deserialize<RuntimeRunDefinition>(Options) ?? throw new ArgumentException("Missing definition.");
        if (string.IsNullOrWhiteSpace(definition.SessionId) || string.IsNullOrWhiteSpace(definition.ModelVersionId) ||
            string.IsNullOrWhiteSpace(definition.SourceSnapshotId) || string.IsNullOrWhiteSpace(definition.ProfileVersionId) ||
            string.IsNullOrWhiteSpace(definition.RunConfigurationVersionId) || string.IsNullOrWhiteSpace(definition.ScenarioVersionId) ||
            definition.Profile is null || definition.Scenario is null || definition.ConfirmedServiceMappings is null ||
            string.IsNullOrWhiteSpace(definition.ComposeYaml) || definition.Scenario.SessionId != definition.SessionId ||
            (expectedSessionId is not null && (definition.SessionId != expectedSessionId || definition.ResourceProject is null)))
            throw new ArgumentException("Definition scope or required input mismatch.");
        _ = RuntimeAllocation.ProjectName(definition.ResourceProject);
        if (expectedSessionId is not null && (definition.ConfirmedServiceMappings.Count is < 1 or > 1000 ||
            definition.ConfirmedServiceMappings.Any(p => string.IsNullOrWhiteSpace(p.Key) || !Guid.TryParse(p.Value, out _))))
            throw new ArgumentException("Managed execution requires confirmed service UUID mappings.");
        return definition;
    }
}
