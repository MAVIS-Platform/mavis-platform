ARG BUILD_IMAGE=maven:3.9.9-eclipse-temurin-21
FROM ${BUILD_IMAGE} AS build
WORKDIR /src
COPY pom.xml ./
COPY src/ ./src/
RUN mvn -q -DskipTests package
FROM eclipse-temurin:21-jre
WORKDIR /app
COPY --from=build /src/target/payment-1.0.0.jar app.jar
ENV SERVER_PORT=8080
ENTRYPOINT ["java", "-jar", "app.jar"]
