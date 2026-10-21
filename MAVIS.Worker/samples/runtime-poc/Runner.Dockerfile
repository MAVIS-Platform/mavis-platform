ARG RUNTIME_IMAGE=mcr.microsoft.com/dotnet/aspnet@sha256:d5633778c754e89a386882eddf8dbee6942447a8a4b8267c19cf1e1158d0b0ac
FROM ${RUNTIME_IMAGE}
WORKDIR /runner
COPY artifacts/runner-publish/ ./
ENTRYPOINT ["dotnet", "MAVIS.Runner.dll"]
