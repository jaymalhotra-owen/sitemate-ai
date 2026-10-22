# SiteMate AI — production image (Fly.io or any container host)
FROM node:22-alpine

ENV NODE_ENV=production
WORKDIR /app
RUN apk add --no-cache su-exec

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY server.js ./
COPY lib ./lib
COPY public ./public
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN sed -i 's/\r$//' /usr/local/bin/docker-entrypoint.sh && chmod +x /usr/local/bin/docker-entrypoint.sh

# Chatbot data lives on a mounted volume (see fly.toml [mounts]).
ENV SITEMATE_DATA_DIR=/data HOST=0.0.0.0 PORT=8080
RUN mkdir -p /data

EXPOSE 8080
ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["node", "server.js"]
