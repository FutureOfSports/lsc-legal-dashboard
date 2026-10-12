FROM node:22-bookworm-slim
WORKDIR /app
COPY ops/firebase/gateway.mjs ./gateway.mjs
USER node
ENV NODE_ENV=production
CMD ["node", "gateway.mjs"]
