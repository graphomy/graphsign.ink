FROM maven:3.9-eclipse-temurin-21 AS build
WORKDIR /build
COPY pom.xml .
COPY src src
RUN mvn -B verify
FROM eclipse-temurin:21-jre
RUN mkdir /keys && chown 10001:10001 /keys
USER 10001:10001
COPY --from=build /build/target/signing-1.0.0.jar /app/signing.jar
EXPOSE 8080
ENTRYPOINT ["java", "-jar", "/app/signing.jar"]
