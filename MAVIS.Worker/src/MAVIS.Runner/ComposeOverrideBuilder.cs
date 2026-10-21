using System.Text.Json;

namespace MAVIS.Runner;

public sealed record RuntimeServiceProfile(string Runtime, int ContainerPort, string ReadinessPath = "/health");
public sealed record RunnerExecutionProfile(string CollectorImage, string InstrumentationVolume,
    IReadOnlyDictionary<string, RuntimeServiceProfile> Applications, int MemoryMiB = 256, double Cpus = 1,
    int TimeoutSeconds = 120, bool ApprovedForLocalPoc = false, string? ScenarioRunnerImage = null,
    string DotnetInstrumentationVersion = "1.17.0", string JavaInstrumentationVersion = "2.32.0");

/// <summary>Generates only an override; it does not claim compatibility or launch workloads.</summary>
public static class ComposeOverrideBuilder
{
    public static string Build(ComposePreflightResult preflight, RunnerExecutionProfile profile, string collectorConfigPath)
    {
        if (!preflight.Compatible || !profile.ApprovedForLocalPoc || profile.MemoryMiB is < 64 or > 2048 ||
            !double.IsFinite(profile.Cpus) || profile.Cpus is <= 0 or > 4 || profile.TimeoutSeconds is < 1 or > 300 ||
            profile.Applications is null || profile.Applications.Count == 0 || profile.Applications.Count > 10 ||
            !Pinned(profile.CollectorImage) || !Name(profile.InstrumentationVolume) || !Path.IsPathFullyQualified(collectorConfigPath) ||
            preflight.Services.Contains("mavis-collector", StringComparer.Ordinal) || preflight.Services.Contains("mavis-agent", StringComparer.Ordinal))
            throw new ArgumentException("A compatible input and an approved, bounded PoC profile are required.");
        var services = new Dictionary<string, object>();
        foreach (var service in preflight.Services)
        {
            var config = new Dictionary<string, object>
            {
                ["cap_drop"] = new[] { "ALL" }, ["security_opt"] = new[] { "no-new-privileges:true" },
                ["pids_limit"] = 128, ["mem_limit"] = profile.MemoryMiB + "m", ["cpus"] = profile.Cpus,
                ["read_only"] = true, ["tmpfs"] = new[] { "/tmp:rw,noexec,nosuid,size=64m" }, ["restart"] = "no",
                ["networks"] = new[] { "default" }
            };
            if (profile.Applications.TryGetValue(service, out var app))
            {
                if (app is null || app.Runtime is not ("dotnet8-linux-x64-glibc" or "java") || app.ContainerPort is < 1 or > 65535 ||
                    app.ReadinessPath is null || !app.ReadinessPath.StartsWith('/') || app.ReadinessPath.StartsWith("//", StringComparison.Ordinal) || app.ReadinessPath.Contains('\\'))
                    throw new ArgumentException("Unsupported application profile.");
                var environment = new Dictionary<string, string>
                {
                    ["OTEL_SERVICE_NAME"] = service, ["OTEL_EXPORTER_OTLP_ENDPOINT"] = "http://mavis-collector:4318",
                    ["OTEL_EXPORTER_OTLP_PROTOCOL"] = "http/protobuf", ["OTEL_TRACES_EXPORTER"] = "otlp",
                    ["OTEL_METRICS_EXPORTER"] = "none", ["OTEL_LOGS_EXPORTER"] = "none", ["OTEL_PROPAGATORS"] = "tracecontext,baggage",
                    ["OTEL_TRACES_SAMPLER"] = "always_on"
                };
                if (app.Runtime == "java") environment["JAVA_TOOL_OPTIONS"] = "-javaagent:/mavis-otel/java/opentelemetry-javaagent.jar";
                else
                {
                    environment["CORECLR_ENABLE_PROFILING"] = "1";
                    environment["CORECLR_PROFILER"] = "{918728DD-259F-4A6A-AC2B-B85E1B658318}";
                    environment["CORECLR_PROFILER_PATH"] = "/mavis-otel/dotnet/linux-x64/OpenTelemetry.AutoInstrumentation.Native.so";
                    environment["DOTNET_STARTUP_HOOKS"] = "/mavis-otel/dotnet/net/OpenTelemetry.AutoInstrumentation.StartupHook.dll";
                    environment["DOTNET_ADDITIONAL_DEPS"] = "/mavis-otel/dotnet/AdditionalDeps";
                    environment["DOTNET_SHARED_STORE"] = "/mavis-otel/dotnet/store";
                    environment["OTEL_DOTNET_AUTO_HOME"] = "/mavis-otel/dotnet";
                    environment["OTEL_DOTNET_AUTO_LOG_DIRECTORY"] = "/tmp/otel";
                }
                config["environment"] = environment;
                config["volumes"] = new[] { new { type = "volume", source = "mavis-instrumentation", target = "/mavis-otel", read_only = true } };
            }
            services[service] = config;
        }
        if (profile.Applications.Keys.Any(k => !preflight.Services.Contains(k, StringComparer.Ordinal))) throw new ArgumentException("Application mapping is not present in Compose.");
        services["mavis-collector"] = new
        {
            image = profile.CollectorImage, command = new[] { "--config=/etc/mavis-collector.yaml" },
            cap_drop = new[] { "ALL" }, security_opt = new[] { "no-new-privileges:true" }, read_only = true,
            mem_limit = "256m", cpus = 1, pids_limit = 64, networks = new[] { "default" },
            user = "0:0",
            volumes = new object[] {
                new { type = "bind", source = collectorConfigPath, target = "/etc/mavis-collector.yaml", read_only = true },
                new { type = "volume", source = "mavis-traces", target = "/traces", read_only = false }
            }
        };
        var result = new
        {
            services,
            networks = new { @default = new { @internal = true } },
            volumes = new Dictionary<string, object> {
                ["mavis-instrumentation"] = new { external = true, name = profile.InstrumentationVolume }, ["mavis-traces"] = new { }
            }
        };
        return JsonSerializer.Serialize(result, new JsonSerializerOptions { WriteIndented = true });
    }

    private static bool Name(string? s) => s is { Length: > 0 and <= 128 } && s.All(c => char.IsAsciiLetterOrDigit(c) || c is '_' or '-' or '.');
    private static bool Pinned(string? s)
    {
        if (s is null) return false;
        var parts = s.Split("@sha256:", StringSplitOptions.None);
        return parts.Length == 2 && parts[0].Length > 0 && parts[1].Length == 64 && parts[1].All(Uri.IsHexDigit);
    }
}
