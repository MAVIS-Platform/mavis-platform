using Microsoft.AspNetCore.Mvc;

namespace MAVIS.Worker.Api.Controllers;

/// <summary>
/// Health check đơn giản để Java (hoặc bất kỳ client nào) kiểm tra Worker
/// còn sống và sẵn sàng nhận request, không cần gửi payload thật.
/// </summary>
[ApiController]
[Route("api/health")]
public sealed class HealthController : ControllerBase
{
    [HttpGet]
    public IActionResult Get()
    {
        return Ok(new
        {
            status = "OK",
            service = "MAVIS.Worker",
            timestampUtc = DateTimeOffset.UtcNow
        });
    }
}
