# One image: the ASP.NET API serving the built PWA from wwwroot.
# Build from the repo root:  docker build -f deploy/Dockerfile -t zarqa .

FROM node:22-alpine AS web
WORKDIR /web
COPY web/package.json web/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY web/ ./
RUN npm run build

FROM mcr.microsoft.com/dotnet/sdk:10.0 AS api
WORKDIR /src
COPY server/Zarqa.Api/Zarqa.Api.csproj Zarqa.Api/
RUN dotnet restore Zarqa.Api/Zarqa.Api.csproj
COPY server/Zarqa.Api/ Zarqa.Api/
RUN dotnet publish Zarqa.Api/Zarqa.Api.csproj -c Release -o /out --no-restore

FROM mcr.microsoft.com/dotnet/aspnet:10.0
WORKDIR /app
COPY --from=api /out ./
COPY --from=web /web/dist ./wwwroot
ENV ASPNETCORE_URLS=http://+:8080
EXPOSE 8080
USER app
ENTRYPOINT ["dotnet", "Zarqa.Api.dll"]
