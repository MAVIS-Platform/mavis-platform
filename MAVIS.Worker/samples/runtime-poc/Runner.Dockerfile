ARG RUNTIME_IMAGE=mcr.microsoft.com/dotnet/aspnet:8.0
FROM ${RUNTIME_IMAGE}
WORKDIR /runner
COPY artifacts/runner-publish/ ./
ENTRYPOINT ["dotnet", "MAVIS.Runner.dll"]
