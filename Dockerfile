FROM node:20-bookworm-slim

WORKDIR /app

# Chromium + fonts for Puppeteer PDF reports (conference SIFC export)
RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    chromium \
    ca-certificates \
    fonts-liberation \
    fonts-noto-color-emoji \
  && rm -rf /var/lib/apt/lists/*

ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

COPY package.json package-lock.json ./
# Chromium already installed above — skip postinstall (needs full repo copy)
RUN npm ci --omit=dev --ignore-scripts

COPY . .

RUN mkdir -p server/uploads

ENV NODE_ENV=production
ENV PORT=5000

EXPOSE 5000

CMD ["npm", "start"]
