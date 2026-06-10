## Docker Deployment Guide

Using Docker is the recommended way to host **CalagopusStats** in a self-contained environment. The bot is configured to skip the interactive Setup Wizard automatically if configuration variables are provided in the environment.

---

### 🐳 1. Docker Compose (Recommended)

Docker Compose allows you to manage the bot lifecycle alongside your config mounts and health checks.

1. Create a directory for the bot.
2. Copy `config.yml` into that directory and customize it.
3. Create a `docker-compose.yml` file in the same directory:

```yaml
version: '3.3'
services:
  calagopusstats:
    container_name: calagopusstats
    image: ghcr.io/heyitslumi/calagopusstats:latest
    restart: always
    volumes:
      - ./config.yml:/app/config.yml
    environment:
      - PanelURL=https://panel.example.com
      - PanelKEY=c7sp_yourAdminAPIKeyHere
      - DiscordBotToken=MTQ3MTg2.yourDiscordBotTokenHere
      - DiscordChannel=1304520281020305441
    healthcheck:
      test: ["CMD", "node", "healthcheck.js"]
      interval: 1m
      timeout: 10s
      retries: 3
      start_period: 30s
```

4. Launch the container in detached mode:
```bash
docker compose up -d
```
5. Inspect the logs:
```bash
docker compose logs -f calagopusstats
```

---

### 🐳 2. Docker Run Command

If you prefer to launch the container directly using `docker run`:

1. Copy `config.yml` to your current working directory.
2. Run the command replacing placeholder values with your credentials:

```bash
docker run -d \
  --name calagopusstats \
  -e PanelURL=https://panel.example.com \
  -e PanelKEY=c7sp_yourAdminAPIKey \
  -e DiscordBotToken=MTQ3MTg2.yourBotToken \
  -e DiscordChannel=1304520281020305441 \
  -v $(pwd)/config.yml:/app/config.yml \
  --health-cmd="node healthcheck.js" \
  --health-interval=1m \
  --health-timeout=10s \
  --health-retries=3 \
  --health-start-period=30s \
  ghcr.io/heyitslumi/calagopusstats:latest
```

3. Inspect logs:
```bash
docker logs -f calagopusstats
```

---

### 🩺 Monitoring Health Status

Because the bot writes regular heartbeats to `health.json` during its refresh cycles, Docker can monitor if the bot process hangs or crashes.

- **View Status:**
  ```bash
  docker ps
  ```
  Look for `(healthy)` or `(unhealthy)` inside the **STATUS** column.

- **View Health History:**
  ```bash
  docker inspect --format='{{json .State.Health}}' calagopusstats
  ```
