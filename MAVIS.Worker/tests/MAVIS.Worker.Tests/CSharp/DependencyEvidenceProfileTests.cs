using System.Security.Cryptography;
using System.Text;
using MAVIS.Worker.Application.Analysis;
using MAVIS.Worker.Infrastructure.CSharp;
using Microsoft.Extensions.Options;

namespace MAVIS.Worker.Tests.CSharp;

public sealed class DependencyEvidenceProfileTests : IDisposable
{
    private readonly string _root = Path.Combine(Path.GetTempPath(), "mavis-dependencies-" + Guid.NewGuid().ToString("N"));
    private void Write(string file, string text) { Directory.CreateDirectory(_root); File.WriteAllText(Path.Combine(_root, file), text); }
    private Task<DotnetAnalysisResult> Analyze() => new DotnetProjectAnalyzer(Options.Create(new DotnetAnalysisOptions { AllowedSourceRoots = [_root] }))
        .AnalyzeAsync(new("project", "snapshot", _root, "job"), CancellationToken.None);
    private const string EfFixture = """
        namespace Microsoft.EntityFrameworkCore {
            public class DbContext { public System.Threading.Tasks.Task<int> SaveChangesAsync() => System.Threading.Tasks.Task.FromResult(1); }
            public class DbSet<T> { public System.Threading.Tasks.Task<T[]> ToListAsync() => System.Threading.Tasks.Task.FromResult(new T[0]); }
            public class DbContextOptionsBuilder {}
            public static class Provider { public static DbContextOptionsBuilder UseSqlServer(this DbContextOptionsBuilder options, string value) => options; }
        }
        namespace Microsoft.Extensions.DependencyInjection {
            public static class DbRegistration { public static IServiceCollection AddDbContext<T>(this IServiceCollection services, System.Action<Microsoft.EntityFrameworkCore.DbContextOptionsBuilder> configure) => services; }
        }
        """;
    private const string DbCode = """
        using Microsoft.EntityFrameworkCore; using Microsoft.Extensions.DependencyInjection; using Microsoft.Extensions.Configuration;
        class Order {} class AppDb : DbContext { public DbSet<Order> Orders { get; } }
        class Startup { public void Configure(IServiceCollection services, IConfiguration config) {
            services.AddDbContext<AppDb>(o => o.UseSqlServer(config.GetConnectionString("Orders")));
        } }
        class Caller { public async System.Threading.Tasks.Task Run(AppDb db) { await db.Orders.ToListAsync(); await db.SaveChangesAsync(); } }
        """;

    [Fact]
    public async Task EfReadWriteAndConfigurationRemainDataAccessWithoutLeakingCredentials()
    {
        Write("App.csproj", "<Project />"); Write("Ef.cs", EfFixture); Write("App.cs", DbCode);
        Write("appsettings.json", """{"ConnectionStrings":{"Orders":"Server=tcp:db,1433;Database=OrdersDb;User ID=user;Password=SECRET_SENTINEL"}}""");
        var result = await Analyze();
        var access = result.Findings.Where(f => f.Kind == "DataAccess").ToArray();
        Assert.Equal(new[] { "CONFIGURE", "READ", "WRITE" }, access.Select(f => f.Properties!["operation"]).Order().ToArray());
        Assert.All(access, f => { Assert.Equal("Orders", f.Target); Assert.Equal("ConfigurationAlias", f.ResolutionStatus); Assert.Contains(f.AdditionalEvidence!, e => e.FilePath == "appsettings.json"); });
        var database = Assert.Single(result.Canonical!.Elements.Where(e => e.Kind == "DATABASE"));
        Assert.Equal("db", database.Properties!["host"]); Assert.Equal("1433", database.Properties["port"]);
        Assert.Contains(result.Canonical.Relationships, r => r.Type == "DATABASE_ACCESS" && r.DependencyKind == "DATA_ACCESS:WRITE");
        Assert.DoesNotContain(result.Canonical.Relationships, r => r.Type == "SERVICE_HTTP_CALL");
        Assert.DoesNotContain("SECRET_SENTINEL", System.Text.Json.JsonSerializer.Serialize(result));
    }

    [Fact]
    public async Task MissingOrConflictingDatabaseConfigurationDoesNotInventPhysicalDatabase()
    {
        Write("App.csproj", "<Project />"); Write("Ef.cs", EfFixture); Write("App.cs", DbCode);
        var missing = await Analyze();
        Assert.All(missing.Findings.Where(f => f.Kind == "DataAccess"), f => Assert.Null(f.Target));
        Write("appsettings.json", """{"ConnectionStrings":{"Orders":"Server=db;Database=A"}}""");
        Write("appsettings.Development.json", """{"ConnectionStrings":{"Orders":"Server=db;Database=B"}}""");
        var ambiguous = await Analyze();
        Assert.All(ambiguous.Findings.Where(f => f.Kind == "DataAccess"), f => { Assert.Null(f.Target); Assert.Equal("Ambiguous", f.ResolutionStatus); });
        Assert.Contains(ambiguous.Warnings, w => w.Code == "UNRESOLVED_DATABASE_TARGET");
    }

    [Fact]
    public async Task DiTypeDependenciesAndFakeDatabaseMethodsStaySeparate()
    {
        Write("App.csproj", "<Project />");
        Write("App.cs", """
            using Microsoft.Extensions.DependencyInjection;
            interface IStore {} class Store : IStore {} class Consumer(IStore store) { public Store[] Values { get; set; } }
            class Setup { public void Run(IServiceCollection services) { services.AddScoped<IStore, Store>(); services.AddSingleton(typeof(IStore), typeof(Store)); new Fake().SaveChanges(); } }
            class Fake { public void SaveChanges() {} }
            """);
        var result = await Analyze();
        Assert.Equal(2, result.Findings.Count(f => f.Kind == "DependencyInjection"));
        Assert.Contains(result.Findings, f => f.Kind == "CodeDependency" && f.Subject == "Consumer" && f.Target == "IStore");
        Assert.Contains(result.Findings, f => f.Kind == "CodeDependency" && f.Target == "Store");
        Assert.DoesNotContain(result.Findings, f => f.Kind == "DataAccess");
        Assert.Contains(result.Canonical!.Relationships, r => r.Type == "CODE_DEPENDENCY" && r.DependencyKind == "DI");
        Assert.DoesNotContain(result.Canonical.Relationships, r => r.Type is "DATABASE_ACCESS" or "SERVICE_HTTP_CALL");
    }

    [Fact]
    public async Task EveryEvidenceAndRelationshipResolvesAndLogicalIdsSurviveLineMoves()
    {
        Write("App.csproj", "<Project />");
        const string code = "interface IStore {} class Store : IStore { public Store(IStore dependency) {} }";
        Write("App.cs", code); var first = await Analyze();
        var canonical = first.Canonical!; Assert.True(canonical.RequiresCanonicalMerge);
        var evidenceIds = canonical.Evidence.Select(e => e.Id).ToHashSet(); var elementIds = canonical.Elements.Select(e => e.Id).ToHashSet();
        Assert.All(canonical.Relationships, r => { Assert.Contains(r.FromId, elementIds); Assert.Contains(r.ToId, elementIds); Assert.NotEmpty(r.EvidenceIds); });
        var referenced = canonical.Elements.SelectMany(e => e.EvidenceIds).Concat(canonical.Relationships.SelectMany(r => r.EvidenceIds)).ToHashSet();
        Assert.True(evidenceIds.SetEquals(referenced));
        Assert.All(first.Findings, f => { Assert.NotNull(f.Id); Assert.NotEmpty(f.EvidenceIds!); Assert.All(f.EvidenceIds!, id => Assert.Contains(id, evidenceIds)); });
        Assert.All(canonical.Evidence, e => { Assert.Equal("snapshot", e.SourceSnapshotId); Assert.Equal(64, e.FileHash.Length); Assert.Equal(64, e.EvidenceHash.Length); Assert.False(Path.IsPathFullyQualified(e.Location.FilePath)); });
        var expectedHash = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(code))).ToLowerInvariant();
        Assert.All(canonical.Evidence.Where(e => e.Location.FilePath == "App.cs"), e => Assert.Equal(expectedHash, e.FileHash));
        Write("App.cs", "\n\n" + code); var second = await Analyze();
        Assert.Equal(canonical.Elements.Select(e => e.Id), second.Canonical!.Elements.Select(e => e.Id));
        Assert.Equal(canonical.Relationships.Select(e => e.Id), second.Canonical.Relationships.Select(e => e.Id));
        Assert.NotEqual(first.InputDigest, second.InputDigest);
    }

    [Fact]
    public async Task InstanceDiOverloadsAreNotMisreportedAsSelfRegistration()
    {
        Write("App.csproj", "<Project />");
        Write("App.cs", "using Microsoft.Extensions.DependencyInjection; interface IStore {} class Store : IStore {} class Setup { void Run(IServiceCollection s) { s.AddSingleton<IStore>(new Store()); s.AddSingleton(typeof(IStore), new Store()); } }");
        var result = await Analyze();
        Assert.DoesNotContain(result.Findings, f => f.Kind == "DependencyInjection");
        Assert.Contains(result.Warnings, w => w.Code == "UNRESOLVED_DI_REGISTRATION");
    }

    [Fact]
    public async Task ProjectReferenceIsConfigCodeDependencyAndNeverHttpOrContainmentImpact()
    {
        Write("A.csproj", "<Project><ItemGroup><ProjectReference Include=\"B.csproj\" /></ItemGroup></Project>");
        Write("B.csproj", "<Project />");
        var result = await Analyze();
        var relation = Assert.Single(result.Canonical!.Relationships);
        Assert.Equal("CODE_DEPENDENCY", relation.Type); Assert.Equal("PROJECT_REFERENCE", relation.DependencyKind); Assert.Equal("CONFIG", relation.Origin);
        Assert.All(relation.EvidenceIds, id => Assert.Contains(result.Canonical.Evidence, e => e.Id == id && e.Origin == "CONFIG"));
    }

    [Fact]
    public async Task GenericDelegateAndNestedEnumLogicalIdsDoNotCollide()
    {
        Write("App.csproj", "<Project />");
        Write("App.cs", "delegate void Handler<T>(); delegate void Handler<T,U>(); class Outer<T> { public enum State { On } } class Outer<T,U> { public enum State { On } }");
        var result = await Analyze();
        var names = result.Canonical!.Elements.Where(e => e.Kind == "CLASS_INTERFACE").Select(e => e.Name).ToArray();
        Assert.Contains("Handler`1", names); Assert.Contains("Handler`2", names);
        Assert.Contains("Outer`1.State", names); Assert.Contains("Outer`2.State", names);
    }
    public void Dispose() { if (Directory.Exists(_root)) Directory.Delete(_root, true); }
}
