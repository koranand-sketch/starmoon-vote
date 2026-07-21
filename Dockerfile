FROM node:20-alpine

WORKDIR /app

# Install backend dependencies
COPY server/package*.json ./server/
WORKDIR /app/server
RUN npm install --omit=dev

# Copy application source
WORKDIR /app
COPY server ./server
COPY public ./public

EXPOSE 3000

CMD ["node", "server/server.js"]
