using YamlDotNet.Core;
using YamlDotNet.RepresentationModel;
using YamlDotNet.Core.Events;

namespace MAVIS.Runner;

public sealed record PreflightIssue(string Code, string? Service = null);
public sealed record ComposePreflightResult(bool Compatible, IReadOnlyList<string> Services,
    IReadOnlyList<PreflightIssue> Errors, IReadOnlyList<string> Limitations, IReadOnlyDictionary<string, string>? PinnedImages = null,
    IReadOnlySet<string>? HealthcheckServices = null);

/// <summary>Strict image-only Linux PoC profile. Validation is not a container security boundary.</summary>
public static class ComposePreflight
{
    private static readonly HashSet<string> RootKeys = ["services", "volumes"];
    private static readonly HashSet<string> ServiceKeys =
        ["image", "command", "entrypoint", "environment", "depends_on", "healthcheck", "expose", "volumes", "user", "working_dir", "init", "stop_grace_period"];

    public static ComposePreflightResult Check(string yaml)
    {
        var errors = new List<PreflightIssue>();
        var names = new List<string>();
        var images = new Dictionary<string, string>();
        var healthchecks = new HashSet<string>(StringComparer.Ordinal);
        var limitations = new[] { "IMAGE_ONLY_POC_PROFILE", "NO_BUILD_OR_START_PERFORMED", "IMAGE_OS_AND_INSTRUMENTATION_UNVERIFIED",
            "RUNNER_ISOLATION_AND_EGRESS_MUST_BE_ENFORCED_AT_EXECUTION", "PROFILE_NOT_YET_ACCEPTANCE_VALIDATED" };
        try
        {
            if (yaml.Length > 1_048_576) return new(false, [], [new("COMPOSE_TOO_LARGE")], limitations);
            var parser = new Parser(new StringReader(yaml));
            var depth = 0;
            var events = 0;
            while (parser.MoveNext())
            {
                if (++events > 20_000) return new(false, [], [new("COMPOSE_NODE_LIMIT")], limitations);
                if (parser.Current is MappingStart or SequenceStart) depth++;
                if (parser.Current is MappingEnd or SequenceEnd) depth--;
                if (depth > 64) return new(false, [], [new("COMPOSE_DEPTH_LIMIT")], limitations);
                if (parser.Current is AnchorAlias || parser.Current is NodeEvent nodeEvent && !nodeEvent.Anchor.IsEmpty)
                    return new(false, [], [new("YAML_ALIASES_UNSUPPORTED")], limitations);
                if (parser.Current is Scalar scalarEvent && scalarEvent.Value.Contains('$'))
                    return new(false, [], [new("COMPOSE_INTERPOLATION_UNSUPPORTED")], limitations);
            }
            var stream = new YamlStream(); stream.Load(new StringReader(yaml));
            if (stream.Documents.Count != 1 || stream.Documents[0].RootNode is not YamlMappingNode root)
                return new(false, [], [new("INVALID_COMPOSE_ROOT")], limitations);
            var visited = new HashSet<YamlNode>(ReferenceEqualityComparer.Instance);
            var pending = new Stack<YamlNode>(); pending.Push(root);
            while (pending.TryPop(out var node))
            {
                if (!visited.Add(node) || !node.Anchor.IsEmpty) return new(false, [], [new("YAML_ALIASES_UNSUPPORTED")], limitations);
                if (visited.Count > 10_000) return new(false, [], [new("COMPOSE_NODE_LIMIT")], limitations);
                if (node is YamlMappingNode map)
                    foreach (var pair in map.Children) { pending.Push(pair.Key); pending.Push(pair.Value); }
                if (node is YamlSequenceNode seq) foreach (var item in seq.Children) pending.Push(item);
            }
            foreach (var pair in root.Children)
                if (pair.Key is not YamlScalarNode key || !RootKeys.Contains(key.Value ?? "")) errors.Add(new("UNSUPPORTED_ROOT_OPTION"));
            if (!TryGet(root, "services", out var servicesNode) || servicesNode is not YamlMappingNode services || services.Children.Count is < 1 or > 20)
                return new(false, [], [new("INVALID_SERVICE_COUNT")], limitations);
            var volumes = new HashSet<string>(StringComparer.Ordinal);
            if (TryGet(root, "volumes", out var volumeNode))
            {
                if (volumeNode is not YamlMappingNode declaredVolumes) errors.Add(new("INVALID_VOLUMES"));
                else foreach (var pair in declaredVolumes.Children)
                {
                    if (pair.Key is not YamlScalarNode key || !ValidName(key.Value) || key.Value!.StartsWith("mavis-", StringComparison.Ordinal) ||
                        !(pair.Value is YamlScalarNode { Value: null or "" } || pair.Value is YamlMappingNode { Children.Count: 0 }))
                        errors.Add(new("VOLUME_DRIVER_OR_EXTERNAL_FORBIDDEN"));
                    else volumes.Add(key.Value!);
                }
            }
            foreach (var pair in services.Children)
            {
                var name = (pair.Key as YamlScalarNode)?.Value;
                if (!ValidName(name) || pair.Value is not YamlMappingNode service) { errors.Add(new("INVALID_SERVICE")); continue; }
                names.Add(name!);
                if (TryGet(service, "healthcheck", out var healthcheck) && healthcheck is YamlMappingNode probe
                    && TryGet(probe, "test", out var test)
                    && ((test is YamlSequenceNode sequenceTest && sequenceTest.Children.Count > 0 && sequenceTest.Children[0].ToString() != "NONE")
                        || (test is YamlScalarNode scalarTest && !string.IsNullOrWhiteSpace(scalarTest.Value))))
                    healthchecks.Add(name!);
                foreach (var option in service.Children)
                    if (option.Key is not YamlScalarNode key || !ServiceKeys.Contains(key.Value ?? "")) errors.Add(new("UNSUPPORTED_OR_UNSAFE_SERVICE_OPTION", name));
                if (!TryGet(service, "image", out var image) || image is not YamlScalarNode imageScalar || string.IsNullOrWhiteSpace(imageScalar.Value) ||
                    imageScalar.Value.Contains('$') || !(imageScalar.Value.Contains("@sha256:", StringComparison.Ordinal) || imageScalar.Value.StartsWith("sha256:", StringComparison.Ordinal)))
                    errors.Add(new("PINNED_IMAGE_DIGEST_REQUIRED", name));
                else
                {
                    var digest = imageScalar.Value.StartsWith("sha256:", StringComparison.Ordinal) ? imageScalar.Value[7..] : imageScalar.Value.Split("@sha256:").Last();
                    if (digest.Length != 64 || !digest.All(Uri.IsHexDigit)) errors.Add(new("INVALID_IMAGE_DIGEST", name));
                    else images[name!] = imageScalar.Value;
                }
                if (TryGet(service, "volumes", out var mounts))
                {
                    if (mounts is not YamlSequenceNode sequence) errors.Add(new("INVALID_MOUNTS", name));
                    else foreach (var mount in sequence.Children)
                    {
                        // Only explicit long-form session-owned named volumes; no anonymous/bind/host mounts.
                        if (mount is not YamlMappingNode mapping || !TryGet(mapping, "type", out var type) || type.ToString() != "volume" ||
                            !TryGet(mapping, "source", out var source) || !volumes.Contains(source.ToString()) ||
                            !TryGet(mapping, "target", out var target) || !target.ToString().StartsWith('/') ||
                            target.ToString().Contains("docker.sock", StringComparison.OrdinalIgnoreCase) ||
                            mapping.Children.Keys.Any(k => k.ToString() is not ("type" or "source" or "target" or "read_only")))
                            errors.Add(new("HOST_OR_UNSUPPORTED_MOUNT_FORBIDDEN", name));
                    }
                }
                if (TryGet(service, "environment", out var environment))
                {
                    if (environment is not YamlMappingNode env) errors.Add(new("EXPLICIT_ENVIRONMENT_MAPPING_REQUIRED", name));
                    else if (env.Children.Any(e => e.Value is not YamlScalarNode scalar || scalar.Value is null || scalar.Value.Contains("${", StringComparison.Ordinal)))
                        errors.Add(new("UNRESOLVED_ENVIRONMENT", name));
                }
            }
        }
        catch (YamlException) { errors.Add(new("INVALID_COMPOSE_YAML")); }
        catch (ArgumentException) { errors.Add(new("INVALID_COMPOSE_YAML")); }
        return new(errors.Count == 0, names, errors, limitations, images, healthchecks);
    }

    private static bool ValidName(string? name) => name is { Length: > 0 and <= 63 } &&
        name.All(c => char.IsAsciiLetterOrDigit(c) || c is '_' or '-');
    internal static bool TryGet(YamlMappingNode map, string key, out YamlNode value) => map.Children.TryGetValue(new YamlScalarNode(key), out value!);
}
