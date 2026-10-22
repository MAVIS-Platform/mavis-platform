var app = WebApplication.CreateBuilder(args).Build();
app.MapGet("/health", () => Results.Ok(new { status = "ready" }));
app.MapGet("/catalog", () => Results.Ok(new { sku = "catalog-001", available = true }));
app.Run();
