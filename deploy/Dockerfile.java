FROM maven:3.9-eclipse-temurin-17 AS build
WORKDIR /src
COPY maoyi-backend/ ./
RUN mvn -B -DskipTests package
FROM eclipse-temurin:17-jre
RUN mkdir -p /app/.data/uploads /app/.data/logs && chown -R 10001:10001 /app
WORKDIR /app
COPY --from=build /src/ruoyi-admin/target/maoyi-backend.jar /app/app.jar
USER 10001:10001
ENV BIND_ADDRESS=0.0.0.0
EXPOSE 8080
ENTRYPOINT ["java","-jar","/app/app.jar","--spring.profiles.active=druid,maoyi"]
