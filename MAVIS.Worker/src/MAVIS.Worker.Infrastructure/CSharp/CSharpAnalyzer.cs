using System.Text.RegularExpressions;
using MAVIS.Worker.Application.Contracts.Requests;
using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.CSharp;
using Microsoft.CodeAnalysis.CSharp.Syntax;

namespace MAVIS.Worker.Infrastructure.CSharp;

/// <summary>
/// Roslyn-based C# analyzer - quét HttpClient, IHttpClientFactory, Refit, RestSharp, config references.
/// </summary>
public sealed class CSharpAnalyzer : ICSharpAnalyzer
{
    public bool IsApplicable(string sourceLocation)
    {
        if (string.IsNullOrWhiteSpace(sourceLocation) || !Directory.Exists(sourceLocation))
            return false;

        return Directory.EnumerateFiles(sourceLocation, "*.csproj", SearchOption.AllDirectories).Any();
    }

    public async Task<IReadOnlyList<RawFindingDto>> AnalyzeAsync(string sourceLocation, CancellationToken ct = default)
    {
        var findings = new List<RawFindingDto>();

        var csFiles = Directory.EnumerateFiles(sourceLocation, "*.cs", SearchOption.AllDirectories)
            .Where(f => !f.Contains("\\obj\\") && !f.Contains("\\bin\\")) // skip build artifacts
            .ToList();

        foreach (var filePath in csFiles)
        {
            ct.ThrowIfCancellationRequested();

            try
            {
                var content = await File.ReadAllTextAsync(filePath, ct);
                var tree = CSharpSyntaxTree.ParseText(content, cancellationToken: ct);
                var root = await tree.GetRootAsync(ct);

                var serviceId = InferServiceId(filePath, sourceLocation);
                var walker = new CSharpDependencyWalker(serviceId, filePath);
                walker.Visit(root);

                findings.AddRange(walker.Findings);
            }
            catch (Exception ex)
            {
                // Log và skip file lỗi
                Console.WriteLine($"[CSharpAnalyzer] Error parsing {filePath}: {ex.Message}");
            }
        }

        return findings;
    }

    /// <summary>
    /// Suy ra ServiceId từ tên project/namespace gần nhất.
    /// Ví dụ: C:/source/OrderService/Controllers/OrderController.cs → "OrderService"
    /// </summary>
    private static string InferServiceId(string filePath, string sourceRoot)
    {
        var relativePath = Path.GetRelativePath(sourceRoot, filePath);
        var parts = relativePath.Split(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar);

        // Lấy phần tử đầu tiên (tên thư mục gốc = tên service)
        return parts.Length > 0 ? parts[0] : "Unknown";
    }
}

/// <summary>
/// SyntaxWalker để tìm HTTP calls, config references trong C# syntax tree.
/// </summary>
internal sealed class CSharpDependencyWalker : CSharpSyntaxWalker
{
    private readonly string _serviceId;
    private readonly string _filePath;
    private readonly List<RawFindingDto> _findings = new();

    public IReadOnlyList<RawFindingDto> Findings => _findings;

    public CSharpDependencyWalker(string serviceId, string filePath)
    {
        _serviceId = serviceId;
        _filePath = filePath;
    }

    public override void VisitInvocationExpression(InvocationExpressionSyntax node)
    {
        // Pattern 1: httpClient.GetAsync("http://order-service/api/orders")
        // Pattern 2: httpClient.PostAsync(url, content)
        // Pattern 3: CreateClient("OrderService")
        
        var memberAccess = node.Expression as MemberAccessExpressionSyntax;
        if (memberAccess == null)
        {
            base.VisitInvocationExpression(node);
            return;
        }

        var methodName = memberAccess.Name.Identifier.Text;

        // HttpClient methods
        if (IsHttpClientMethod(methodName))
        {
            var (url, method) = ExtractHttpCallInfo(node, methodName);
            if (!string.IsNullOrWhiteSpace(url))
            {
                _findings.Add(new RawFindingDto
                {
                    Language = "csharp",
                    ServiceId = _serviceId,
                    Kind = "HTTP_REST_CALL",
                    Target = ExtractTargetService(url),
                    HttpMethod = method,
                    Url = url,
                    FilePath = _filePath,
                    StartLine = GetLineNumber(node),
                    Snippet = node.ToString().Length > 200 ? node.ToString()[..200] + "..." : node.ToString()
                });
            }
        }

        // IHttpClientFactory.CreateClient("ServiceName")
        if (methodName == "CreateClient" && node.ArgumentList.Arguments.Count > 0)
        {
            var arg = node.ArgumentList.Arguments[0].Expression;
            if (arg is LiteralExpressionSyntax literal && literal.Token.ValueText is string clientName)
            {
                _findings.Add(new RawFindingDto
                {
                    Language = "csharp",
                    ServiceId = _serviceId,
                    Kind = "HTTP_CLIENT_FACTORY",
                    Target = clientName,
                    FilePath = _filePath,
                    StartLine = GetLineNumber(node),
                    Snippet = node.ToString()
                });
            }
        }

        base.VisitInvocationExpression(node);
    }

    public override void VisitElementAccessExpression(ElementAccessExpressionSyntax node)
    {
        // Pattern: IConfiguration["Services:OrderService:Url"]
        // Pattern: Environment.GetEnvironmentVariable("ORDER_SERVICE_URL")
        
        var expression = node.Expression.ToString();
        if (expression.Contains("config", StringComparison.OrdinalIgnoreCase))
        {
            var arg = node.ArgumentList.Arguments.FirstOrDefault()?.Expression;
            if (arg is LiteralExpressionSyntax literal && literal.Token.ValueText is string key)
            {
                _findings.Add(new RawFindingDto
                {
                    Language = "csharp",
                    ServiceId = _serviceId,
                    Kind = "CONFIG_REFERENCE",
                    Target = key,
                    FilePath = _filePath,
                    StartLine = GetLineNumber(node),
                    Snippet = node.ToString()
                });
            }
        }

        base.VisitElementAccessExpression(node);
    }

    private static bool IsHttpClientMethod(string methodName)
    {
        return methodName is "GetAsync" or "PostAsync" or "PutAsync" or "DeleteAsync" or "PatchAsync"
            or "GetStringAsync" or "SendAsync";
    }

    private static (string? url, string method) ExtractHttpCallInfo(InvocationExpressionSyntax invocation, string methodName)
    {
        if (invocation.ArgumentList.Arguments.Count == 0)
            return (null, "");

        var firstArg = invocation.ArgumentList.Arguments[0].Expression;

        // Nếu là string literal: "http://..."
        if (firstArg is LiteralExpressionSyntax literal && literal.Token.Value is string url)
        {
            var httpMethod = methodName switch
            {
                "GetAsync" or "GetStringAsync" => "GET",
                "PostAsync" => "POST",
                "PutAsync" => "PUT",
                "DeleteAsync" => "DELETE",
                "PatchAsync" => "PATCH",
                _ => "UNKNOWN"
            };
            return (url, httpMethod);
        }

        // Nếu là biến/property: baseUrl, _orderServiceUrl, etc. → lấy tên biến
        if (firstArg is IdentifierNameSyntax identifier)
        {
            return (identifier.Identifier.Text, methodName.Replace("Async", "").ToUpperInvariant());
        }

        // Interpolated string: $"http://{host}/api"
        if (firstArg is InterpolatedStringExpressionSyntax interpolated)
        {
            return (interpolated.ToString(), methodName.Replace("Async", "").ToUpperInvariant());
        }

        return (null, "");
    }

    private static string? ExtractTargetService(string url)
    {
        // Cố gắng extract service name từ URL
        // http://order-service/api → "order-service"
        // http://localhost:5001/api → "localhost:5001"
        
        try
        {
            if (Uri.TryCreate(url, UriKind.Absolute, out var uri))
            {
                return uri.Host;
            }

            // Relative URL hoặc service name: "/api/orders" hoặc "order-service/api"
            var match = Regex.Match(url, @"^/?([a-zA-Z0-9\-_]+)");
            return match.Success ? match.Groups[1].Value : null;
        }
        catch
        {
            return null;
        }
    }

    private int GetLineNumber(SyntaxNode node)
    {
        var lineSpan = node.GetLocation().GetLineSpan();
        return lineSpan.StartLinePosition.Line + 1;
    }
}
