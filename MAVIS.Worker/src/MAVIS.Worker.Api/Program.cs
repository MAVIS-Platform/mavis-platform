using MAVIS.Worker.Infrastructure;

var builder = WebApplication.CreateBuilder(args);

// Add services to the container.

builder.Services.AddControllers();
// Learn more about configuring Swagger/OpenAPI at https://aka.ms/aspnetcore/swashbuckle
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();

builder.Services.AddWorkerInfrastructure();
builder.Services.Configure<MAVIS.Worker.Infrastructure.CSharp.DotnetAnalysisOptions>(
    builder.Configuration.GetSection("DotnetAnalysis"));
builder.Services.AddSingleton<MAVIS.Worker.Application.Analysis.IDotnetProjectAnalyzer,
    MAVIS.Worker.Infrastructure.CSharp.DotnetProjectAnalyzer>();

var app = builder.Build();

// Configure the HTTP request pipeline.
if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}

app.UseHttpsRedirection();

app.UseAuthorization();

app.MapControllers();

app.Run();

// Expose Program class for WebApplicationFactory<Program> in integration tests.
public partial class Program { }
