FROM maven:3.9.11-eclipse-temurin-21 AS build
WORKDIR /workspace
COPY pom.xml .
COPY src ./src
RUN mvn -B -DskipTests package

FROM eclipse-temurin:21-jre
WORKDIR /app
# Run unprivileged; size the heap from the container's memory limit (small PaaS instances).
RUN useradd --system --no-create-home payflow
COPY --from=build /workspace/target/payflow-api-0.1.0.jar app.jar
USER payflow
ENV JAVA_TOOL_OPTIONS="-XX:MaxRAMPercentage=75 -XX:+ExitOnOutOfMemoryError"
EXPOSE 8080
ENTRYPOINT ["java", "-jar", "/app/app.jar"]
