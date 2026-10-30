# syntax=docker/dockerfile:1

# Build stage. The tests are not run here: the integration tests need Docker (Testcontainers), and CI runs them
# on the same commit before it builds the image.
FROM eclipse-temurin:25-jdk AS build
WORKDIR /build
# "sh" because a Windows checkout loses the executable bit.
COPY mvnw pom.xml ./
COPY .mvn .mvn
# Dependencies in their own layer: Docker reuses it until pom.xml changes.
RUN sh mvnw -B -q dependency:go-offline
COPY src src
RUN sh mvnw -B -q package -DskipTests && cp target/*.jar application.jar
# Splits the jar into layers, from the one that changes least (dependencies) to the one that changes most (our code).
RUN java -Djarmode=tools -jar application.jar extract --layers --destination extracted

# Runtime stage: a JRE only, no build tools, and not root. Alpine is small and its busybox wget serves the
# health check.
FROM eclipse-temurin:25-jre-alpine
RUN addgroup -S app && adduser -S -G app app
WORKDIR /application
# One COPY per layer: a code change only rebuilds and ships the last one.
COPY --from=build /build/extracted/dependencies/ ./
COPY --from=build /build/extracted/spring-boot-loader/ ./
COPY --from=build /build/extracted/snapshot-dependencies/ ./
COPY --from=build /build/extracted/application/ ./
USER app
EXPOSE 8080
# Exec form: java is PID 1 and receives SIGTERM for a graceful shutdown. The heap follows the container's memory
# limit. This application.jar only holds our classes and a classpath pointing to the extracted libraries.
ENTRYPOINT ["java", "-XX:MaxRAMPercentage=75", "-jar", "application.jar"]
