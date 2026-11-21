ARG BUILD_IMAGE=maven:3.9.9-eclipse-temurin-21
FROM ${BUILD_IMAGE} AS build
WORKDIR /src
COPY pom.xml ./
COPY src/ ./src/
RUN set -eux; \
    for attempt in 1 2 3; do \
      mvn -B -ntp -DskipTests package && exit 0; \
      if [ "$attempt" -eq 3 ]; then exit 1; fi; \
      echo "Maven build failed; retrying in $((attempt * 5)) seconds..."; \
      sleep "$((attempt * 5))"; \
    done
FROM eclipse-temurin:21-jre
WORKDIR /app
COPY --from=build /src/target/gateway-1.0.0.jar app.jar
ENV SERVER_PORT=8080
ENTRYPOINT ["java", "-jar", "app.jar"]
