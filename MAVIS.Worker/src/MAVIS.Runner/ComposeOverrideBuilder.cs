using System.Text.Json;

namespace MAVIS.Runner;

public sealed record RuntimeEnvironmentBinding(string Name, string Reference);
public sealed record RuntimeServiceProfile(string Runtime, int ContainerPort, string ReadinessPath = "/health", bool AllowClientErrorReadiness = false);
public sealed record StudioBlock(string Service, string Label, bool CanScale = false, bool InitiallyStopped = false);
public sealed record StudioConnection(string From, string To, string ControllerService, string Protocol, bool InitiallyStopped = false);
public sealed record StudioTopology(int Version, IReadOnlyList<StudioBlock> Blocks, IReadOnlyList<StudioConnection> Connections);
public sealed record RunnerExecutionProfile(string CollectorImage, string InstrumentationVolume,
    IReadOnlyDictionary<string, RuntimeServiceProfile> Applications, int MemoryMiB = 256, double Cpus = 1,
    int TimeoutSeconds = 120, bool ApprovedForLocalPoc = false, string? ScenarioRunnerImage = null,
    string DotnetInstrumentationVersion = "1.17.0", string JavaInstrumentationVersion = "2.32.0", IReadOnlyDictionary<string, IReadOnlyList<RuntimeEnvironmentBinding>>? EnvironmentBindings = null,
    StudioTopology? StudioTopology = null);

/// <summary>Generates only an override; it does not claim compatibility or launch workloads.</summary>
public static class ComposeOverrideBuilder
{
    public static string Build(ComposePreflightResult preflight, RunnerExecutionProfile profile, string collectorConfigPath, IReadOnlyDictionary<string,string>? protectedValues = null)
    {
        if (!preflight.Compatible || !profile.ApprovedForLocalPoc || profile.MemoryMiB is < 64 or > 2048 ||
            !double.IsFinite(profile.Cpus) || profile.Cpus is <= 0 or > 4 || profile.TimeoutSeconds is < 1 or > 300 ||
            profile.Applications is null || profile.Applications.Count == 0 || profile.Applications.Count > 10 ||
            !Pinned(profile.CollectorImage) || !Name(profile.InstrumentationVolume) || !Path.IsPathFullyQualified(collectorConfigPath) ||
            preflight.Services.Contains("mavis-collector", StringComparer.Ordinal) || preflight.Services.Contains("mavis-agent", StringComparer.Ordinal))
            throw new ArgumentException("A compatible input and an approved, bounded PoC profile are required.");
        if (profile.EnvironmentBindings?.Keys.Any(service => !preflight.Services.Contains(service)) == true) throw new ArgumentException("Environment bindings target an unknown service.");
        var services = new Dictionary<string, object>();
        foreach (var service in preflight.Services)
        {
            var config = new Dictionary<string, object>
            {
                ["cap_drop"] = new[] { "ALL" }, ["security_opt"] = new[] { "no-new-privileges:true" },
                ["pids_limit"] = 256, ["mem_limit"] = profile.MemoryMiB + "m", ["cpus"] = profile.Cpus,
                ["read_only"] = true, ["tmpfs"] = new[] { "/tmp:rw,noexec,nosuid,size=64m" }, ["restart"] = "no",
                // Preserve the source/image probe while allowing cold startup within the approved deadline.
                ["healthcheck"] = new { start_period = Math.Clamp(profile.TimeoutSeconds, 1, 300) + "s" },
                ["networks"] = new[] { "default" }
            };
            var protectedEnvironment = new Dictionary<string,string>();
            foreach (var binding in profile.EnvironmentBindings?.GetValueOrDefault(service) ?? [])
            {
                if (protectedEnvironment.Count >= 64 || binding is null || !System.Text.RegularExpressions.Regex.IsMatch(binding.Name,"^[A-Z][A-Z0-9_]{0,63}$") ||
                    new[]{"OTEL_","JAVA_","JDK_","DOTNET_","CORECLR_","LD_","MAVIS_"}.Any(prefix=>binding.Name.StartsWith(prefix,StringComparison.Ordinal)) || binding.Name=="PATH" ||
                    protectedValues is null || !protectedValues.TryGetValue(binding.Reference,out var value)) throw new ArgumentException("Application environment binding unavailable or reserved.");
                // Compose interpolation must not expand user inputs against the runner host environment.
                protectedEnvironment[binding.Name]=value.Replace("$", "$$", StringComparison.Ordinal);
            }
            if(protectedEnvironment.Count>0)config["environment"]=protectedEnvironment;
            if (profile.Applications.TryGetValue(service, out var app))
            {
                if (app is null || app.Runtime is not ("dotnet8-linux-x64-glibc" or "dotnet8-linux-x64-musl" or "java" or "passthrough") || app.ContainerPort is < 1 or > 65535 ||
                    app.ReadinessPath is null || !app.ReadinessPath.StartsWith('/') || app.ReadinessPath.StartsWith("//", StringComparison.Ordinal) || app.ReadinessPath.Contains('\\'))
                    throw new ArgumentException("Unsupported application profile.");
                var environment = new Dictionary<string, string>
                {
                    ["OTEL_SERVICE_NAME"] = service, ["OTEL_EXPORTER_OTLP_ENDPOINT"] = "http://mavis-collector:4318",
                    ["OTEL_EXPORTER_OTLP_PROTOCOL"] = "http/protobuf", ["OTEL_TRACES_EXPORTER"] = "otlp",
                    ["OTEL_METRICS_EXPORTER"] = "none", ["OTEL_LOGS_EXPORTER"] = "none", ["OTEL_PROPAGATORS"] = "tracecontext,baggage",
                    ["OTEL_TRACES_SAMPLER"] = "always_on"
                };
                if (app.Runtime == "java")
                {
                    environment["JAVA_TOOL_OPTIONS"] = "-javaagent:/mavis-otel/java/opentelemetry-javaagent.jar -XX:+UseContainerSupport -XX:MaxRAMPercentage=70.0";
                    // Ensure OTel Java agent stays active for JEP-330 single-file `java Server.java` launchers.
                    environment["OTEL_JAVAAGENT_ENABLED"] = "true";
                    // Exclude optional mail and host-disk checks in the read-only, isolated sandbox.
                    environment["MANAGEMENT_HEALTH_MAIL_ENABLED"] = "false";
                    environment["MANAGEMENT_HEALTH_DISKSPACE_ENABLED"] = "false";
                    config["volumes"] = new[] { new { type = "volume", source = "mavis-instrumentation", target = "/mavis-otel", read_only = true } };
                }
                else if (app.Runtime is "dotnet8-linux-x64-glibc" or "dotnet8-linux-x64-musl")
                {
                    bool musl = app.Runtime == "dotnet8-linux-x64-musl";
                    string agentHome = musl ? "/mavis-otel/dotnet-musl" : "/mavis-otel/dotnet";
                    string nativeDirectory = musl ? "linux-musl-x64" : "linux-x64";
                    environment["CORECLR_ENABLE_PROFILING"] = "1";
                    environment["CORECLR_PROFILER"] = "{918728DD-259F-4A6A-AC2B-B85E1B658318}";
                    environment["CORECLR_PROFILER_PATH"] = $"{agentHome}/{nativeDirectory}/OpenTelemetry.AutoInstrumentation.Native.so";
                    environment["DOTNET_STARTUP_HOOKS"] = $"{agentHome}/net/OpenTelemetry.AutoInstrumentation.StartupHook.dll";
                    environment["DOTNET_ADDITIONAL_DEPS"] = $"{agentHome}/AdditionalDeps";
                    environment["DOTNET_SHARED_STORE"] = $"{agentHome}/store";
                    environment["OTEL_DOTNET_AUTO_HOME"] = agentHome;
                    environment["OTEL_DOTNET_AUTO_LOG_DIRECTORY"] = "/tmp/otel";
                    environment["OTEL_DOTNET_AUTO_LOGGER"] = "console";
                    config["volumes"] = new[] { new { type = "volume", source = "mavis-instrumentation", target = "/mavis-otel", read_only = true } };
                }
                foreach (var pair in protectedEnvironment) environment[pair.Key]=pair.Value;
                config["environment"] = environment;
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
        var volumes = new Dictionary<string, object> { ["mavis-traces"] = new { } };
        if (profile.Applications.Values.Any(a => a.Runtime != "passthrough"))
            volumes["mavis-instrumentation"] = new { external = true, name = profile.InstrumentationVolume };
        var result = new
        {
            services,
            networks = new { @default = new { @internal = true } },
            volumes
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
