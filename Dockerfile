FROM node:20-alpine

WORKDIR /app

# copies package.json, and package-lock.json if it exists!
COPY package*.json ./

# checks if lockfile exists to run 'npm ci', otherwise falls back
RUN if [ -f package-lock.json ]; then npm ci --only=production; else npm install --only=production; fi

COPY . .

HEALTHCHECK --interval=1m --timeout=10s --retries=3 CMD node healthcheck.js

CMD ["node", "index.js"]