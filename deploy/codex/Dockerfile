FROM node:22-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates \
    && rm -rf /var/lib/apt/lists/* \
    && npm install -g @openai/codex@0.160.0 --no-audit --no-fund
WORKDIR /gateway
COPY deploy/codex/gateway.mjs ./
RUN mkdir -p /home/node/.codex && chown node:node /home/node/.codex
USER node
ENV CODEX_HOME=/home/node/.codex
EXPOSE 8090
CMD ["node", "gateway.mjs"]
