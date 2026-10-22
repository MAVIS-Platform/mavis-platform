var builder = WebApplication.CreateBuilder(args);
builder.Services.AddHttpClient();
var app = builder.Build();
app.MapGet("/health", () => Results.Ok(new { status = "ready" }));
app.MapGet("/orders", async (IHttpClientFactory clients) =>
{
    var payment = await clients.CreateClient().GetStringAsync(Environment.GetEnvironmentVariable("PAYMENT_URL") + "/pay");
    return Results.Ok(new { id = "order-001", payment });
});
app.MapGet("/failed-order", async (IHttpClientFactory clients) =>
{
    var response = await clients.CreateClient().GetAsync(Environment.GetEnvironmentVariable("PAYMENT_URL") + "/fail");
    return Results.StatusCode((int)response.StatusCode);
});
app.Run();
