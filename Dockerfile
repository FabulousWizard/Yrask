FROM oven/bun:1

WORKDIR /app

COPY package.json bun.lock bunfig.toml ./
RUN bun install --frozen-lockfile

COPY . .

EXPOSE 8080
CMD ["bun", "run", "dev", "--host", "0.0.0.0", "--port", "8080"]
