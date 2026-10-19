ARG RUNTIME_IMAGE=mcr.microsoft.com/dotnet/aspnet:8.0
FROM ${RUNTIME_IMAGE}
WORKDIR /app
COPY publish/ ./
ENV ASPNETCORE_URLS=http://+:8080
ENTRYPOINT ["dotnet", "Catalog.dll"]
