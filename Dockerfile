FROM node:16-bullseye

WORKDIR /app

# Install deps (incl. devDeps: serverless + serverless-offline)
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund || npm install --no-audit --no-fund

COPY . .

ENV NODE_ENV=development
EXPOSE 3000

RUN chmod +x entrypoint.sh
CMD ["./entrypoint.sh"]
