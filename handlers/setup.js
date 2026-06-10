const { intro, outro, text, password, select, spinner, isCancel, cancel, note, confirm } = require('@clack/prompts');
const { Client, GatewayIntentBits } = require("discord.js");
const cliColor = require("cli-color");
const axios = require("axios");
const fs = require("node:fs");
const yaml = require("js-yaml");

// Helper to escape regex special characters
function escapeRegExp(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Helper for robust URL format checking
const isValidURL = (url) => {
    try {
        const parsed = new URL(url);
        return parsed.protocol.startsWith("http");
    } catch (error) {
        return false;
    }
};

// Check for cancel action (Ctrl+C or Esc)
function handleCancel(value) {
    if (isCancel(value)) {
        cancel('Setup cancelled.');
        process.exit(0);
    }
}

// Validates Pterodactyl/Calagopus panel endpoint and API admin credentials
async function testPanel(url, key) {
    if (!url || !key) return { success: false, message: "URL and API key cannot be empty." };
    if (!isValidURL(url)) return { success: false, message: "Invalid URL format." };
    
    try {
        const origin = new URL(url).origin;
        await axios(`${origin}/api/admin/nodes?page=1&per_page=1`, {
            method: "GET",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${key}`
            },
            timeout: 5000
        });
        return { success: true };
    } catch (error) {
        let errorMsg = error.message;
        if (error.code === "ENOTFOUND") {
            errorMsg = "DNS Error. Check your panel URL and internet connection.";
        } else if (error.code === "ECONNREFUSED") {
            errorMsg = "Connection refused. Verify the panel port and host.";
        } else if (error.response) {
            if (error.response.status === 401 || error.response.status === 403) {
                errorMsg = `HTTP ${error.response.status}: Invalid Application API Key (make sure it's an Admin Key).`;
            } else {
                errorMsg = `HTTP ${error.response.status}: ${error.response.statusText}`;
            }
        }
        return { success: false, message: errorMsg };
    }
}

// Validates Discord Token by performing a temporary connection test
async function testDiscordBot(token) {
    if (!token) return { success: false, message: "Bot token cannot be empty." };
    const tempClient = new Client({ intents: [GatewayIntentBits.Guilds] });
    try {
        await tempClient.login(token);
        const tag = tempClient.user.tag;
        tempClient.destroy();
        return { success: true, tag };
    } catch (error) {
        return { success: false, message: error.message };
    }
}

// Validates Discord Channel and verify accessibility
async function testDiscordChannel(token, channelId) {
    if (!token || !channelId) return { success: false, message: "Token and Channel ID cannot be empty." };
    const tempClient = new Client({ intents: [GatewayIntentBits.Guilds] });
    try {
        await tempClient.login(token);
        const channel = await tempClient.channels.fetch(channelId);
        if (!channel) {
            tempClient.destroy();
            return { success: false, message: "Channel not found or bot does not belong to the channel's server." };
        }
        const guildName = channel.guild ? channel.guild.name : "DM/Unknown";
        const channelName = channel.name || "Unknown-Channel";
        tempClient.destroy();
        return { success: true, channelName, guildName };
    } catch (error) {
        tempClient.destroy();
        return { success: false, message: error.message };
    }
}

// Loads credentials from .env and config.yml to present them as default choices
function loadExistingConfig() {
    const defaults = {
        panelName: "Panel Stats",
        panelUrl: "https://panel.example.com",
        panelApiKey: "",
        botToken: "",
        channelId: ""
    };
    
    // Parse .env
    if (fs.existsSync(".env")) {
        try {
            const envContent = fs.readFileSync(".env", "utf8");
            const lines = envContent.split(/\r?\n/);
            for (const line of lines) {
                const parts = line.split('=');
                if (parts.length >= 2) {
                    const key = parts[0].trim();
                    const val = parts.slice(1).join('=').trim();
                    if (key === "PanelURL") defaults.panelUrl = val;
                    if (key === "PanelKEY") defaults.panelApiKey = val;
                    if (key === "DiscordBotToken") defaults.botToken = val;
                    if (key === "DiscordChannel") defaults.channelId = val;
                }
            }
        } catch (e) {}
    }
    
    // Parse config.yml
    if (fs.existsSync("config.yml")) {
        try {
            const configObj = yaml.load(fs.readFileSync("./config.yml", "utf8"));
            if (configObj?.embed?.panel?.title) {
                defaults.panelName = configObj.embed.panel.title;
            }
        } catch (e) {}
    }
    
    return defaults;
}

// Saves updated credentials and updates the template configuration file
async function saveConfiguration(configData) {
    // Save setup complete check flag
    fs.writeFileSync(".setup-complete", "If you want to re-run the setup process, you can delete this file.", "utf8");
    
    // Save secrets environment file
    fs.writeFileSync(
        ".env",
        `PanelURL=${configData.panelUrl}\n` +
        `PanelKEY=${configData.panelApiKey}\n` +
        `DiscordBotToken=${configData.botToken}\n` +
        `DiscordChannel=${configData.channelId}`,
        "utf8"
    );
    
    // Edit config.yml while preserving all formatting and user comments
    if (fs.existsSync("config.yml")) {
        try {
            const yamlConfig = yaml.load(fs.readFileSync("./config.yml", "utf8"));
            const oldTitle = yamlConfig?.embed?.panel?.title || "Panel Stats";
            const oldUrl = yamlConfig?.button?.row1?.[0]?.url || "https://panel.example.com";
            
            let rawConfig = fs.readFileSync("./config.yml", "utf8");
            
            // Update title
            const titleRegex = new RegExp(`title:\\s*["']?${escapeRegExp(oldTitle)}["']?`, 'g');
            rawConfig = rawConfig.replace(titleRegex, `title: "${configData.panelName}"`);
            
            // Update button url
            const urlRegex = new RegExp(`url:\\s*["']?${escapeRegExp(oldUrl)}["']?`, 'g');
            rawConfig = rawConfig.replace(urlRegex, `url: "${configData.panelUrl}"`);
            
            fs.writeFileSync("config.yml", rawConfig, "utf8");
        } catch (e) {
            // Silently fallback if patch fails
        }
    }
}

// Helper question prompting methods
async function askPanelName(initial) {
    const val = await text({
        message: "Panel Name\n" + cliColor.blackBright("│  ") + cliColor.blackBright("Used as the main title for status cards (e.g. Lumi's Host)"),
        placeholder: "Panel Stats",
        initialValue: initial,
        validate(v) { if (!v || !v.trim()) return "Panel name cannot be empty!"; }
    });
    handleCancel(val);
    return val;
}

async function askPanelUrlAndKey(initialUrl, initialKey) {
    const url = await text({
        message: "Panel URL\n" + cliColor.blackBright("│  ") + cliColor.blackBright("The base web address of your control panel (e.g. https://panel.example.com)"),
        placeholder: "https://panel.example.com",
        initialValue: initialUrl,
        validate(v) {
            if (!v || !v.trim()) return "Panel URL cannot be empty!";
            if (!isValidURL(v)) return "Invalid URL format. Include http/https.";
        }
    });
    handleCancel(url);
    
    const key = await password({
        message: "Panel API Key\n" + cliColor.blackBright("│  ") + cliColor.blackBright("Application API Key generated under Admin -> API. Needs Read permission for Nodes.") + (initialKey ? "\n" + cliColor.blackBright("│  ") + cliColor.yellow("[Press Enter to keep existing]") : ""),
        validate(v) {
            if ((!v || !v.trim()) && !initialKey) return "API key cannot be empty!";
        }
    });
    handleCancel(key);
    
    return {
        url,
        key: (!key || key.trim() === "") ? initialKey : key
    };
}

async function askBotToken(initialToken) {
    const token = await password({
        message: "Discord Bot Token\n" + cliColor.blackBright("│  ") + cliColor.blackBright("The bot application secret from the Discord Developer Portal -> Bot page") + (initialToken ? "\n" + cliColor.blackBright("│  ") + cliColor.yellow("[Press Enter to keep existing]") : ""),
        validate(v) {
            if ((!v || !v.trim()) && !initialToken) return "Bot Token cannot be empty!";
        }
    });
    handleCancel(token);
    return (!token || token.trim() === "") ? initialToken : token;
}

async function askChannelId(initialId) {
    const id = await text({
        message: "Discord Status Channel ID\n" + cliColor.blackBright("│  ") + cliColor.blackBright("The numeric ID of the text channel where the bot will post and edit the status"),
        initialValue: initialId,
        validate(v) {
            if (!v || !v.trim()) return "Channel ID cannot be empty!";
            if (!/^\d+$/.test(v)) return "Channel ID must be numeric!";
        }
    });
    handleCancel(id);
    return id;
}

// Main interactive Wizard execution
module.exports = async function Setup() {
    const configData = loadExistingConfig();
    
    console.clear();
    console.log(); // Spacing margin at the top of the terminal screen
    intro(cliColor.cyanBright.bold("CalagopusStats Setup Wizard"));
    
    note(
        "Welcome! This wizard will guide you through configuring your bot.\n" +
        "Before starting, please make sure you have the following ready:\n\n" +
        "  1. Calagopus/Pterodactyl base Panel URL & Admin Application API Key\n" +
        "  2. Discord Bot Token (from Discord Developer Portal)\n" +
        "  3. Channel ID of the Discord text channel to host status embeds",
        "Setup Guide & Prerequisites"
    );
    
    // 1. Panel Name
    configData.panelName = await askPanelName(configData.panelName);
    
    // 2 & 3. Panel URL and API Key with automatic validation
    let panelVerified = false;
    while (!panelVerified) {
        const urlAndKey = await askPanelUrlAndKey(configData.panelUrl, configData.panelApiKey);
        configData.panelUrl = urlAndKey.url;
        configData.panelApiKey = urlAndKey.key;
        
        const s = spinner();
        s.start("Verifying connection to Calagopus Panel...");
        const testRes = await testPanel(configData.panelUrl, configData.panelApiKey);
        if (testRes.success) {
            s.stop(cliColor.green("Panel connection verified successfully!"));
            panelVerified = true;
        } else {
            s.stop(cliColor.red(`Connection failed: ${testRes.message}`));
            const adjust = await confirm({
                message: "Do you want to re-enter your panel URL and API key?",
                initialValue: true
            });
            handleCancel(adjust);
            if (!adjust) {
                cancel("Setup aborted. Valid panel URL and Admin API Key are required to run the bot.");
                process.exit(1);
            }
        }
    }
    
    // 4. Discord Bot Token with validation
    let botVerified = false;
    while (!botVerified) {
        configData.botToken = await askBotToken(configData.botToken);
        
        const s = spinner();
        s.start("Authenticating with Discord...");
        const testRes = await testDiscordBot(configData.botToken);
        if (testRes.success) {
            s.stop(cliColor.green(`Authenticated successfully! (Logged in as ${testRes.tag})`));
            botVerified = true;
        } else {
            s.stop(cliColor.red(`Authentication failed: ${testRes.message}`));
            const adjust = await confirm({
                message: "Do you want to re-enter your Discord Bot Token?",
                initialValue: true
            });
            handleCancel(adjust);
            if (!adjust) {
                cancel("Setup aborted. A valid Discord Bot Token is required to run the bot.");
                process.exit(1);
            }
        }
    }
    
    // 5. Discord Status Channel ID with validation
    let channelVerified = false;
    while (!channelVerified) {
        configData.channelId = await askChannelId(configData.channelId);
        
        const s = spinner();
        s.start("Verifying Discord Channel...");
        const testRes = await testDiscordChannel(configData.botToken, configData.channelId);
        if (testRes.success) {
            s.stop(cliColor.green(`Channel verified: #${testRes.channelName} in "${testRes.guildName}"`));
            channelVerified = true;
        } else {
            s.stop(cliColor.red(`Channel verification failed: ${testRes.message}`));
            const adjust = await confirm({
                message: "Do you want to re-enter your Channel ID?",
                initialValue: true
            });
            handleCancel(adjust);
            if (!adjust) {
                cancel("Setup aborted. A valid Discord Status Channel ID is required to host panel status updates.");
                process.exit(1);
            }
        }
    }
    
    // Interactive Review & Navigation Loop
    while (true) {
        console.clear();
        intro(cliColor.cyanBright.bold("CalagopusStats Configuration Review"));
        
        const maskedKey = configData.panelApiKey ? (configData.panelApiKey.slice(0, 8) + "•".repeat(16)) : "[Not Set]";
        const maskedToken = configData.botToken ? (configData.botToken.slice(0, 8) + "•".repeat(16)) : "[Not Set]";
        
        note(
            `Panel Name : ${configData.panelName}\n` +
            `Panel URL  : ${configData.panelUrl}\n` +
            `API Key    : ${maskedKey}\n` +
            `Bot Token  : ${maskedToken}\n` +
            `Channel ID : ${configData.channelId}`,
            "Current Configuration Summary"
        );
        
        const option = await select({
            message: "What would you like to do?",
            options: [
                { value: "save", label: "✔ Save & Apply Configuration", hint: "Writes config files and launches the bot" },
                { value: "name", label: "✏ Edit Panel Name" },
                { value: "panel", label: "✏ Edit Panel URL & API Key" },
                { value: "token", label: "✏ Edit Discord Bot Token" },
                { value: "channel", label: "✏ Edit Discord Status Channel ID" },
                { value: "exit", label: "✖ Cancel & Exit" }
            ]
        });
        handleCancel(option);
        
        if (option === "save") {
            const s = spinner();
            s.start("Writing configuration files...");
            await saveConfiguration(configData);
            s.stop("Configuration applied successfully!");
            outro(cliColor.greenBright.bold("CalagopusStats is online and running."));
            
            // Start bot process now that the wizard has fully closed out
            require("./application.js")();
            break;
        } else if (option === "exit") {
            cancel("Setup cancelled.");
            process.exit(0);
        } else if (option === "name") {
            configData.panelName = await askPanelName(configData.panelName);
        } else if (option === "panel") {
            const urlAndKey = await askPanelUrlAndKey(configData.panelUrl, configData.panelApiKey);
            configData.panelUrl = urlAndKey.url;
            configData.panelApiKey = urlAndKey.key;
            
            const s = spinner();
            s.start("Verifying connection to Calagopus Panel...");
            const testRes = await testPanel(configData.panelUrl, configData.panelApiKey);
            if (testRes.success) {
                s.stop(cliColor.green("Panel connection verified successfully!"));
            } else {
                s.stop(cliColor.red(`Connection failed: ${testRes.message}`));
                await confirm({ message: "Press enter to return to menu", initialValue: true });
            }
        } else if (option === "token") {
            configData.botToken = await askBotToken(configData.botToken);
            
            const s = spinner();
            s.start("Authenticating with Discord...");
            const testRes = await testDiscordBot(configData.botToken);
            if (testRes.success) {
                s.stop(cliColor.green(`Authenticated successfully! (Logged in as ${testRes.tag})`));
            } else {
                s.stop(cliColor.red(`Authentication failed: ${testRes.message}`));
                await confirm({ message: "Press enter to return to menu", initialValue: true });
            }
        } else if (option === "channel") {
            configData.channelId = await askChannelId(configData.channelId);
            
            const s = spinner();
            s.start("Verifying Discord Channel...");
            const testRes = await testDiscordChannel(configData.botToken, configData.channelId);
            if (testRes.success) {
                s.stop(cliColor.green(`Channel verified: #${testRes.channelName} in "${testRes.guildName}"`));
            } else {
                s.stop(cliColor.red(`Channel verification failed: ${testRes.message}`));
                await confirm({ message: "Press enter to return to menu", initialValue: true });
            }
        }
    }
};