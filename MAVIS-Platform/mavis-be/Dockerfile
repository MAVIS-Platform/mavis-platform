# Build from the repository root: the Maven reactor includes the Worker Java client.
FROM maven:3.9-eclipse-temurin-21 AS build
WORKDIR /source
COPY MAVIS-Platform/mavis-be/ MAVIS-Platform/mavis-be/
COPY MAVIS.Worker/integration/java-client/ MAVIS.Worker/integration/java-client/
RUN mvn -B -ntp -f MAVIS-Platform/mavis-be/pom.xml -pl mavis-bootstrap -am package -DskipTests

FROM docker:27-cli AS docker-cli

FROM eclipse-temurin:21-jre-jammy AS runtime
COPY --from=docker-cli /usr/local/bin/docker /usr/local/bin/docker
COPY --from=docker-cli /usr/local/libexec/docker/cli-plugins/ /usr/local/libexec/docker/cli-plugins/
WORKDIR /app
RUN groupadd --gid 1654 mavis && useradd --uid 1654 --gid 1654 --create-home mavis \
    && mkdir -p /data/uploads /data/worker-artifacts && chown -R 1654:1654 /data
COPY --from=build /source/MAVIS-Platform/mavis-be/mavis-bootstrap/target/mavis-bootstrap-0.0.1-SNAPSHOT.jar /app/app.jar
USER 1654:1654
EXPOSE 8080
ENTRYPOINT ["java", "-jar", "/app/app.jar"]
