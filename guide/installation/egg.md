## Pterodactyl / Pelican Egg Installation Guide

Installing **CalagopusStats** via Pterodactyl or Pelican panel is the recommended method for game hosting platforms.

---

### 🥚 1. Import the Egg

1. Download the custom egg template: [`calagopusstats-egg.json`](https://raw.githubusercontent.com/heyitslumi/CalagopusStats/main/calagopusstats-egg.json)
2. Import the JSON egg file into your Pterodactyl or Pelican Panel:
   - **Pterodactyl:** Panel Admin -> Nests -> Import Egg
   - **Pelican:** Admin Portal -> Eggs -> Import / Add

---

### 🥚 2. Create the Server

1. Create a new server in your panel admin interface.
2. Select **CalagopusStats** under your eggs category.
3. Configure the **Startup / Environment Variables** directly in the panel during creation (or under the server's **Startup** tab later):
   - `PanelURL` (e.g. `https://panel.example.com`)
   - `PanelKEY` (Pterodactyl Application API Key)
   - `DiscordBotToken` (Discord Developer Bot Token)
   - `DiscordChannel` (Discord text channel ID for status updates)

*Note: If these 4 variables are defined in the panel, the bot will auto-bypass the setup wizard and boot up instantly!*

---

### 🥚 3. Alternative: Console Interactive Setup

If you prefer to configure the bot via the console instead of panel environment variables:

1. Leave the startup/environment variables blank in the panel settings.
2. Complete server installation and click **Start**.
3. Open the server console.
4. The interactive `@clack/prompts` wizard will boot and prompt you for the credentials. Use the console text input to answer each step:
   - Use the arrow keys (if TTY is supported) or console answers to confirm.
   - Enter your credentials (keys and tokens are masked).
   - Once confirmed, the configurations will write to `.env` and `config.yml` automatically, and the bot will start running.

---

### 📖 Related Guides
- [How to get Panel API key](../panel-api-key.md)
- [How to get Channel ID](../channel-id.md)