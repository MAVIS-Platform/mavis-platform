namespace MAVIS.Worker.Domain.Exceptions;

/// <summary>
/// Exception cơ sở cho mọi lỗi xảy ra trong quá trình phân tích project.
/// .NET Worker API sẽ map exception này sang HTTP 500 hoặc 422 tuỳ loại.
/// </summary>
public class AnalysisException : Exception
{
    public string Code { get; }

    public AnalysisException(string code, string message)
        : base(message)
    {
        Code = code;
    }

    public AnalysisException(string code, string message, Exception inner)
        : base(message, inner)
    {
        Code = code;
    }
}

public sealed class InvalidProjectException : AnalysisException
{
    public InvalidProjectException(string message)
        : base("INVALID_PROJECT", message) { }
}

public sealed class UnsupportedLanguageException : AnalysisException
{
    public UnsupportedLanguageException(string message)
        : base("UNSUPPORTED_LANGUAGE", message) { }
}

public sealed class ResolutionFailureException : AnalysisException
{
    public ResolutionFailureException(string message)
        : base("RESOLUTION_FAILED", message) { }
}
