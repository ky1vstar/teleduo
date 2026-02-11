FROM node:24-alpine

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && apk add --no-cache tini

COPY server.js ./

EXPOSE 3000

# Use tini as init to properly handle signals (e.g. SIGINT from Ctrl+C)
ENTRYPOINT ["tini", "--"]
CMD ["node", "server.js"]
