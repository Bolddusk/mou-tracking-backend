FROM node:20-alpine

# Working directory
WORKDIR /app

# Install dependencies first (better layer caching)
COPY package.json package-lock.json ./
RUN npm ci

# Copy application source
COPY . .

# Persisted upload storage
RUN mkdir -p server/uploads

ENV NODE_ENV=production
ENV PORT=5000

EXPOSE 5000

# Lightweight container healthcheck against the app's health route
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -q -O - http://127.0.0.1:5000/health > /dev/null 2>&1 || exit 1

CMD ["npm", "start"]
