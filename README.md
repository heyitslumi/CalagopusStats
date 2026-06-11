> [!CAUTION]
> Most of the code was fed to Gemini 3.5 Flash (Medium), and is a fork of [PteroStats](https://github.com/HirziDevs/PteroStats) by HirziDevs, that is licensed under the MIT license. With this note, I cannot guarantee the reliability of this code.

# 🦊 CalagopusStats

**CalagopusStats** is a premium, highly configurable Discord Bot designed to monitor your Calagopus or Pterodactyl Panel stats and post beautiful real-time node resource allocation summaries directly to your Discord server.

## 🧩 Features

- 🛠️ **Modern Setup Wizard:** Built using `@clack/prompts` featuring automatic credential defaults pre-loading, input masking, immediate API verification, and an interactive review/edit navigation dashboard.
- 📊 **Dynamic Allocation Charts:** Grouped node memory allocation comparisons and stacked capacity diagrams rendered dynamically inside Discord Message Components V2.
- 📈 **Historical Trends (`/history`):** Logs metrics hourly to `history.json` and renders a 24-hour dual-axis trend line chart showing Server count and RAM allocations.
- 🔄 **Rotating Status Presence:** Dynamically cycles bot statuses through customizable templates (`config.yml`) displaying real-time servers, users, node uptime, and node statuses.
- ⏰ **Process Timezone Configuration:** Native timezone adjustment (`timezone` config key) that updates all console logs and timestamp formatting to your local region (e.g. `Europe/Paris`).
- 🌐 **Docker Health Checks:** Built-in `healthcheck.js` script to natively monitor container health state and auto-restart if the bot hangs.
- 📦 **Container Bypasses:** Automatically detects environment variables in Docker or Pterodactyl Eggs to skip the wizard and boot up instantly.

## 🎮 Slash Commands

| Command | Description | Permission |
| --- | --- | --- |
| `/stats` | View general panel statistics and a list of online/offline nodes. | Everyone |
| `/node <name>` | View detailed memory, disk, CPU, and Wings daemon specs for a node. | Everyone |
| `/history` | View a 24-hour visual trend line chart of Panel growth and RAM. | Everyone |
| `/help` | Interactive command listing guides, repository links, and command descriptions. | Everyone |
| `/ping` | Check the bot latency and API gateway response speeds. | Everyone |
| `/refresh` | Force an immediate manual refresh of the main status message card. | Administrator |
| `/maintenance <node> <on/off>` | Manage node maintenance state to silence alerts and update embeds. | Administrator |
| `/blacklist <add/remove> <node>` | Exclude or restore a node from status embeds. | Administrator |
| `/alert-test` | Dispatch mock online/offline test cards to verify alert webhooks. | Administrator |
| `/panel-sysinfo` | View hardware specs, database size, and OS info of the Panel host. | Administrator |

## 🚀 Installation & Deployment

Select your preferred deployment method below:

- 🎮 **[Using Pterodactyl/Pelican Egg (Recommended)](guide/installation/egg.md)**
- 🐳 **[Using Docker / Docker Compose](guide/installation/docker.md)**
- 💻 **[Manual Installation (PM2/Node.js)](guide/installation/manual.md)**

### Quick Docker Compose Setup

Create a `docker-compose.yml` file and mount your `config.yml` configuration:

```yaml
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

Run the container:
```bash
docker compose up -d
```

## 📖 Configuration & Guides

- ⚙️ **[Changing Env Configuration](guide/changing-env-configuration.md)**
- 🔑 **[How to get Panel API key](guide/panel-api-key.md)**
- 💬 **[How to get Channel ID](guide/channel-id.md)**
- 🎨 **[How to use Custom Emojis](guide/custom-emoji.md)**
- 🚫 **[Blacklist Nodes Guide](guide/blacklist-nodes.md)**
- 🔔 **[Notifier (Discord Webhook Alerts) Guide](guide/notifier.md)**

## 🤝 Contributing

Issues and pull requests are welcome! Feel free to open an issue or submit a pull request on our [GitHub repository](https://github.com/heyitslumi/CalagopusStats).

*CalagopusStats is licensed under the [MIT License](LICENSE).*
