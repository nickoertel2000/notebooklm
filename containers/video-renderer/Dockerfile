FROM node:24-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends ffmpeg \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY fonts/NotoSans-Latin.ttf ./font.ttf
COPY src ./src

ENV PORT=8080
EXPOSE 8080
USER node
CMD ["node", "src/server.ts"]
