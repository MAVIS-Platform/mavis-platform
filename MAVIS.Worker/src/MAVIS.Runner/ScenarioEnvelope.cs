namespace MAVIS.Runner;

public sealed record ScenarioEnvelope(HttpScenarioDefinition Scenario, IReadOnlyDictionary<string, Uri> Endpoints,
    IReadOnlyDictionary<string, string> Secrets);
