FROM maven:3.9.11-eclipse-temurin-21 AS build
WORKDIR /build
COPY pom.xml .
COPY src ./src
RUN mvn -B -q -DskipTests package
FROM eclipse-temurin:21-jre
WORKDIR /app
RUN groupadd --gid 10001 loccoc && useradd --uid 10001 --gid loccoc --no-create-home loccoc
COPY --from=build /build/target/post-service-0.0.1-SNAPSHOT.jar /app/post-service.jar
USER 10001:10001
EXPOSE 8089
ENTRYPOINT ["java","-jar","/app/post-service.jar"]
