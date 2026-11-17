FROM node:22-bookworm-slim
# Pinned: the gateway reads this version's result format (deploy/claude/gateway.mjs, readResult).
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates \
    && rm -rf /var/lib/apt/lists/* \
    && npm install -g @anthropic-ai/claude-code@2.1.326 --no-audit --no-fund
WORKDIR /gateway
COPY deploy/claude/gateway.mjs ./
RUN mkdir -p /home/node/.claude && chown node:node /home/node/.claude
USER node
# Sign-in and all of Claude Code's own state live in this folder, which is its own volume.
ENV CLAUDE_CONFIG_DIR=/home/node/.claude DISABLE_AUTOUPDATER=1
EXPOSE 8091
CMD ["node", "gateway.mjs"]
