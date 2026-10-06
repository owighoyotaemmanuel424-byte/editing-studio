FROM node:22-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg fonts-dejavu ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json tsconfig.json ./
RUN npm install
COPY src ./src
ENV NODE_ENV=production
CMD ["npm","start"]
