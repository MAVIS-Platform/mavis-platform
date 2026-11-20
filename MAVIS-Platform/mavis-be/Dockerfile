# Build from the repository root: the Maven reactor includes the Worker Java client.
FROM maven:3.9-eclipse-temurin-21 AS build
WORKDIR /source
COPY MAVIS-Platform/mavis-be/ MAVIS-Platform/mavis-be/
COPY MAVIS.Worker/integration/java-client/ MAVIS.Worker/integration/java-client/
RUN mvn -B -ntp -f MAVIS-Platform/mavis-be/pom.xml -pl mavis-bootstrap -am package -DskipTests

FROM mcr.microsoft.com/dotnet/sdk:10.0 AS runner-build
WORKDIR /source
COPY MAVIS.Worker/Directory.Build.props ./
COPY MAVIS.Worker/src/MAVIS.Runner/ ./src/MAVIS.Runner/
RUN dotnet publish src/MAVIS.Runner/MAVIS.Runner.csproj -c Release -p:UseAppHost=false -p:ContinuousIntegrationBuild=true -o /runner-publish

FROM build AS otel-bundle
RUN mkdir -p /otel-bundle/dotnet /otel-bundle/dotnet-musl /otel-bundle/java \
    && curl -fsSL https://github.com/open-telemetry/opentelemetry-dotnet-instrumentation/releases/download/v1.17.0/opentelemetry-dotnet-instrumentation-linux-glibc-x64.zip -o /tmp/dotnet.zip \
    && echo "cc56878f0155e28b6554924fbd420fcb8bec7108cd9d41836dc530764ac923f8  /tmp/dotnet.zip" | sha256sum -c - \
    && (cd /otel-bundle/dotnet && jar xf /tmp/dotnet.zip) && rm /tmp/dotnet.zip \
    && curl -fsSL https://github.com/open-telemetry/opentelemetry-dotnet-instrumentation/releases/download/v1.17.0/opentelemetry-dotnet-instrumentation-linux-musl-x64.zip -o /tmp/dotnet-musl.zip \
    && echo "36eb55ce2f7a9da8ffd70ccbd97761a1917d7f57709f1a6ca9e7029dfa120516  /tmp/dotnet-musl.zip" | sha256sum -c - \
    && (cd /otel-bundle/dotnet-musl && jar xf /tmp/dotnet-musl.zip) && rm /tmp/dotnet-musl.zip \
    && curl -fsSL https://github.com/open-telemetry/opentelemetry-java-instrumentation/releases/download/v2.32.0/opentelemetry-javaagent.jar -o /otel-bundle/java/opentelemetry-javaagent.jar \
    && echo "f787eb6c7f3d18e69a431e108a15278d25ee37f83d68b678f621e063f3988f82  /otel-bundle/java/opentelemetry-javaagent.jar" | sha256sum -c - \
    && chmod -R a+rX /otel-bundle

FROM mcr.microsoft.com/dotnet/aspnet:10.0 AS dotnet-runtime

FROM docker:27-cli AS docker-cli

FROM eclipse-temurin:21-jre-jammy AS runtime
RUN apt-get update && apt-get install -y --no-install-recommends libicu70 && rm -rf /var/lib/apt/lists/*
COPY --from=dotnet-runtime /usr/share/dotnet /usr/share/dotnet
RUN ln -s /usr/share/dotnet/dotnet /usr/local/bin/dotnet
COPY --from=docker-cli /usr/local/bin/docker /usr/local/bin/docker
COPY --from=docker-cli /usr/local/libexec/docker/cli-plugins/ /usr/local/libexec/docker/cli-plugins/
WORKDIR /app
RUN groupadd --gid 1654 mavis && useradd --uid 1654 --gid 1654 --create-home mavis \
    && mkdir -p /data/uploads /data/worker-artifacts /tmp/mavis-runner-state /app/runner /app/samples/runtime-poc /app/otel-bundle \
    && chown -R 1654:1654 /data /tmp/mavis-runner-state /app
COPY --from=build /source/MAVIS-Platform/mavis-be/mavis-bootstrap/target/mavis-bootstrap-0.0.1-SNAPSHOT.jar /app/app.jar
COPY --from=runner-build --chown=1654:1654 /runner-publish/ /app/runner/
COPY --from=otel-bundle --chown=1654:1654 /otel-bundle/ /app/otel-bundle/
COPY --chown=1654:1654 MAVIS.Worker/samples/runtime-poc/collector.yaml /app/samples/runtime-poc/collector.yaml
COPY --chown=1654:1654 MAVIS.Worker/samples/runtime-poc/Runner.Dockerfile /app/samples/runtime-poc/Runner.Dockerfile
USER 1654:1654
EXPOSE 8080
ENTRYPOINT ["java", "-jar", "/app/app.jar"]
