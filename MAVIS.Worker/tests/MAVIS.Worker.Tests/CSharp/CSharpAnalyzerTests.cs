using MAVIS.Worker.Infrastructure.CSharp;

namespace MAVIS.Worker.Tests.CSharp;

public sealed class CSharpAnalyzerTests
{
    private readonly CSharpAnalyzer _analyzer = new();

    [Fact]
    public void IsApplicable_ReturnsFalse_WhenDirectoryDoesNotExist()
    {
        var result = _analyzer.IsApplicable("C:/nonexistent/path");
        Assert.False(result);
    }

    [Fact]
    public void IsApplicable_ReturnsFalse_WhenNoCsProjFiles()
    {
        var tempDir = Path.Combine(Path.GetTempPath(), Guid.NewGuid().ToString());
        Directory.CreateDirectory(tempDir);

        try
        {
            var result = _analyzer.IsApplicable(tempDir);
            Assert.False(result);
        }
        finally
        {
            Directory.Delete(tempDir, true);
        }
    }

    [Fact]
    public void IsApplicable_ReturnsTrue_WhenCsProjExists()
    {
        var tempDir = Path.Combine(Path.GetTempPath(), Guid.NewGuid().ToString());
        Directory.CreateDirectory(tempDir);
        File.WriteAllText(Path.Combine(tempDir, "Test.csproj"), "<Project />");

        try
        {
            var result = _analyzer.IsApplicable(tempDir);
            Assert.True(result);
        }
        finally
        {
            Directory.Delete(tempDir, true);
        }
    }

    [Fact]
    public async Task AnalyzeAsync_DetectsHttpClientGetAsync()
    {
        var tempDir = CreateTempProject();

        var csCode = @"
using System.Net.Http;
using System.Threading.Tasks;

namespace TestService
{
    public class OrderClient
    {
        private readonly HttpClient _httpClient;

        public async Task<string> GetOrders()
        {
            return await _httpClient.GetAsync(""http://order-service/api/orders"");
        }
    }
}";

        File.WriteAllText(Path.Combine(tempDir, "OrderClient.cs"), csCode);

        try
        {
            var findings = await _analyzer.AnalyzeAsync(tempDir);

            Assert.Single(findings);
            var finding = findings[0];
            Assert.Equal("csharp", finding.Language);
            Assert.Equal("HTTP_REST_CALL", finding.Kind);
            Assert.Equal("order-service", finding.Target);
            Assert.Equal("GET", finding.HttpMethod);
            Assert.Equal("http://order-service/api/orders", finding.Url);
            Assert.Contains("OrderClient.cs", finding.FilePath);
            Assert.True(finding.StartLine > 0);
        }
        finally
        {
            Directory.Delete(tempDir, true);
        }
    }

    [Fact]
    public async Task AnalyzeAsync_DetectsHttpClientPostAsync()
    {
        var tempDir = CreateTempProject();

        var csCode = @"
using System.Net.Http;
using System.Threading.Tasks;

namespace TestService
{
    public class PaymentClient
    {
        private readonly HttpClient _client;

        public async Task ProcessPayment()
        {
            var content = new StringContent(""data"");
            await _client.PostAsync(""http://payment-service/api/process"", content);
        }
    }
}";

        File.WriteAllText(Path.Combine(tempDir, "PaymentClient.cs"), csCode);

        try
        {
            var findings = await _analyzer.AnalyzeAsync(tempDir);

            Assert.Single(findings);
            var finding = findings[0];
            Assert.Equal("POST", finding.HttpMethod);
            Assert.Equal("http://payment-service/api/process", finding.Url);
            Assert.Equal("payment-service", finding.Target);
        }
        finally
        {
            Directory.Delete(tempDir, true);
        }
    }

    [Fact]
    public async Task AnalyzeAsync_DetectsHttpClientFactory()
    {
        var tempDir = CreateTempProject();

        var csCode = @"
using System.Net.Http;

namespace TestService
{
    public class OrderService
    {
        private readonly IHttpClientFactory _factory;

        public OrderService(IHttpClientFactory factory)
        {
            _factory = factory;
        }

        public void Init()
        {
            var client = _factory.CreateClient(""OrderServiceClient"");
        }
    }
}";

        File.WriteAllText(Path.Combine(tempDir, "OrderService.cs"), csCode);

        try
        {
            var findings = await _analyzer.AnalyzeAsync(tempDir);

            Assert.Single(findings);
            var finding = findings[0];
            Assert.Equal("HTTP_CLIENT_FACTORY", finding.Kind);
            Assert.Equal("OrderServiceClient", finding.Target);
        }
        finally
        {
            Directory.Delete(tempDir, true);
        }
    }

    [Fact]
    public async Task AnalyzeAsync_DetectsConfigurationReference()
    {
        var tempDir = CreateTempProject();

        var csCode = @"
using Microsoft.Extensions.Configuration;

namespace TestService
{
    public class ServiceConfig
    {
        private readonly IConfiguration _config;

        public string GetServiceUrl()
        {
            return _config[""Services:OrderService:Url""];
        }
    }
}";

        File.WriteAllText(Path.Combine(tempDir, "ServiceConfig.cs"), csCode);

        try
        {
            var findings = await _analyzer.AnalyzeAsync(tempDir);

            Assert.Single(findings);
            var finding = findings[0];
            Assert.Equal("CONFIG_REFERENCE", finding.Kind);
            Assert.Equal("Services:OrderService:Url", finding.Target);
        }
        finally
        {
            Directory.Delete(tempDir, true);
        }
    }

    [Fact]
    public async Task AnalyzeAsync_DetectsMultipleCalls_InSameFile()
    {
        var tempDir = CreateTempProject();

        var csCode = @"
using System.Net.Http;
using System.Threading.Tasks;

namespace TestService
{
    public class MultiServiceClient
    {
        private readonly HttpClient _http;

        public async Task CallServices()
        {
            await _http.GetAsync(""http://order-service/api/orders"");
            await _http.PostAsync(""http://payment-service/api/pay"", null);
            await _http.PutAsync(""http://inventory-service/api/stock"", null);
        }
    }
}";

        File.WriteAllText(Path.Combine(tempDir, "MultiServiceClient.cs"), csCode);

        try
        {
            var findings = await _analyzer.AnalyzeAsync(tempDir);

            Assert.Equal(3, findings.Count);
            Assert.Contains(findings, f => f.Target == "order-service" && f.HttpMethod == "GET");
            Assert.Contains(findings, f => f.Target == "payment-service" && f.HttpMethod == "POST");
            Assert.Contains(findings, f => f.Target == "inventory-service" && f.HttpMethod == "PUT");
        }
        finally
        {
            Directory.Delete(tempDir, true);
        }
    }

    [Fact]
    public async Task AnalyzeAsync_InfersServiceIdFromDirectory()
    {
        var tempDir = Path.Combine(Path.GetTempPath(), Guid.NewGuid().ToString());
        var serviceDir = Path.Combine(tempDir, "PaymentService");
        Directory.CreateDirectory(serviceDir);
        File.WriteAllText(Path.Combine(serviceDir, "Test.csproj"), "<Project />");

        var csCode = @"
using System.Net.Http;
public class Test { 
    public async void M(HttpClient c) { 
        await c.GetAsync(""http://order/api""); 
    } 
}";

        File.WriteAllText(Path.Combine(serviceDir, "Test.cs"), csCode);

        try
        {
            var findings = await _analyzer.AnalyzeAsync(tempDir);

            Assert.Single(findings);
            Assert.Equal("PaymentService", findings[0].ServiceId);
        }
        finally
        {
            Directory.Delete(tempDir, true);
        }
    }

    [Fact]
    public async Task AnalyzeAsync_SkipsBinAndObjFolders()
    {
        var tempDir = CreateTempProject();
        var binDir = Path.Combine(tempDir, "bin", "Debug");
        var objDir = Path.Combine(tempDir, "obj");
        Directory.CreateDirectory(binDir);
        Directory.CreateDirectory(objDir);

        // Valid file
        File.WriteAllText(Path.Combine(tempDir, "Valid.cs"), "public class Valid {}");

        // Files in bin/obj (should be ignored)
        File.WriteAllText(Path.Combine(binDir, "Generated.cs"), "INVALID SYNTAX {{{{");
        File.WriteAllText(Path.Combine(objDir, "Temp.cs"), "INVALID SYNTAX {{{{");

        try
        {
            var findings = await _analyzer.AnalyzeAsync(tempDir);

            // Should not throw, and should not include bin/obj files
            Assert.Empty(findings); // Valid.cs has no HTTP calls
        }
        finally
        {
            Directory.Delete(tempDir, true);
        }
    }

    private static string CreateTempProject()
    {
        var tempDir = Path.Combine(Path.GetTempPath(), Guid.NewGuid().ToString());
        Directory.CreateDirectory(tempDir);
        File.WriteAllText(Path.Combine(tempDir, "Test.csproj"), "<Project />");
        return tempDir;
    }
}
