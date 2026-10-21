namespace MAVIS.Worker.Infrastructure.CSharp;

internal static class ProjectContextOwnership
{
    public static string[] Nearest(string file, IEnumerable<string> projects)
    {
        var comparison = OperatingSystem.IsWindows() ? StringComparison.OrdinalIgnoreCase : StringComparison.Ordinal;
        var owners = projects.Where(p => file.StartsWith(Path.GetDirectoryName(p)! + Path.DirectorySeparatorChar, comparison)).ToArray();
        var length = owners.Select(p => Path.GetDirectoryName(p)!.Length).DefaultIfEmpty(-1).Max();
        return owners.Where(p => Path.GetDirectoryName(p)!.Length == length).Order(StringComparer.Ordinal).ToArray();
    }
}
