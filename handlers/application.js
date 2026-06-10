require("dotenv").config();
const { Client, GatewayIntentBits, ActivityType, REST, Routes, SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");
const config = require("./configuration.js");
const cliColor = require("cli-color");
const logger = require("./logger.js");

const makeRaw = (obj) => {
    if (!obj || typeof obj !== 'object') return obj;
    return {
        ...obj,
        toJSON() {
            const copy = { ...this };
            delete copy.toJSON;
            return copy;
        }
    };
};

let allNodesCache = null;
let allNodesCacheTime = 0;

async function getAllNodesFromPanel() {
    if (allNodesCache && (Date.now() - allNodesCacheTime < 10000)) { // 10 second TTL
        return allNodesCache;
    }
    const axios = require("axios");
    try {
        const res = await axios(`${new URL(process.env?.PanelURL).origin}/api/admin/nodes?page=1&per_page=100`, {
            method: "GET",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${process.env?.PanelKEY}`
            },
            timeout: 3000
        });
        const nodes = res.data && res.data.nodes && res.data.nodes.data ? res.data.nodes.data : [];
        allNodesCache = nodes;
        allNodesCacheTime = Date.now();
        return nodes;
    } catch (err) {
        return allNodesCache || [];
    }
}

module.exports = function Application() {
    logger.system("Starting app...");

    const client = new Client({
        intents: [GatewayIntentBits.Guilds]
    });

    client.getStats = require("./getStats.js");

    client.once("ready", async () => {
        logger.success(`${client.user.tag} is online!`);

        if (config.presence.enable) {
            let activityType = ActivityType.Watching;
            if (config.presence.type) {
                switch (config.presence.type.toLowerCase()) {
                    case "playing":
                        activityType = ActivityType.Playing;
                        break;
                    case "listening":
                        activityType = ActivityType.Listening;
                        break;
                    case "competing":
                        activityType = ActivityType.Competing;
                        break;
                }
            }

            if (config.presence.rotate && config.presence.templates && config.presence.templates.length > 0) {
                let currentIndex = 0;
                const uptimeFormatter = require("./uptimeFormatter.js");

                const updateRotation = () => {
                    if (!client.panelStats) return;

                    const templates = config.presence.templates;
                    const template = templates[currentIndex];
                    currentIndex = (currentIndex + 1) % templates.length;

                    const uptimeStr = client.panelStats.uptime ? uptimeFormatter(Date.now() - client.panelStats.uptime) : "N/A";

                    const text = template
                        .replaceAll("{{servers}}", client.panelStats.servers)
                        .replaceAll("{{users}}", client.panelStats.users)
                        .replaceAll("{{nodes_online}}", client.panelStats.nodesOnline)
                        .replaceAll("{{nodes_total}}", client.panelStats.nodesTotal)
                        .replaceAll("{{uptime}}", uptimeStr);

                    client.user.setActivity(text, { type: activityType });
                };

                setInterval(updateRotation, (config.presence.rotate_interval || 15) * 1000);
            } else if (config.presence.text) {
                client.user.setActivity(config.presence.text, {
                    type: activityType,
                });
            }

            if (config.presence.status) {
                let statusVal = config.presence.status.toLowerCase();
                if (!["idle", "online", "dnd", "invisible"].includes(statusVal)) {
                    statusVal = "online";
                }
                client.user.setStatus(statusVal);
            }
        }

        // Register Slash Commands in background
        const registerCommands = async () => {
            try {
                const rest = new REST({ version: '10' }).setToken(process.env.DiscordBotToken);
                const rawCommands = [
                    new SlashCommandBuilder()
                        .setName('help')
                        .setDescription('Displays information about all commands and guide links.'),
                    new SlashCommandBuilder()
                        .setName('ping')
                        .setDescription('Checks the bot latency.')
                ];

                if (config.history_settings?.enable !== false) {
                    rawCommands.push(
                        new SlashCommandBuilder()
                            .setName('history')
                            .setDescription('Shows 24-hour panel growth and node memory allocation trends.')
                    );
                }

                rawCommands.push(
                    new SlashCommandBuilder()
                        .setName('stats')
                        .setDescription('Replies with a quick panel and nodes status summary or detailed metrics for a specific node.')
                        .addStringOption(option => 
                            option.setName('node')
                                .setDescription('Optional node name to get detailed metrics')
                                .setRequired(false)
                                .setAutocomplete(true)
                        ),
                    new SlashCommandBuilder()
                        .setName('refresh')
                        .setDescription('Forcefully refreshes the posted panel stats card.'),
                    new SlashCommandBuilder()
                        .setName('node')
                        .setDescription('Shows detailed metrics for a specific node.')
                        .addStringOption(option => 
                            option.setName('name')
                                .setDescription('The name of the node')
                                .setRequired(true)
                                .setAutocomplete(true)
                        ),
                    new SlashCommandBuilder()
                        .setName('alert-test')
                        .setDescription('Checks if alerts webhook channel is working correctly by sending mock online/offline cards.')
                        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
                    new SlashCommandBuilder()
                        .setName('panel-sysinfo')
                        .setDescription('Shows system stats, hardware specs, OS, and database size of the Panel host.')
                        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
                    new SlashCommandBuilder()
                        .setName('maintenance')
                        .setDescription('Manage node maintenance state to silence alerts and display maintenance status.')
                        .addStringOption(option => 
                            option.setName('node')
                                .setDescription('The name of the node')
                                .setRequired(true)
                                .setAutocomplete(true)
                        )
                        .addStringOption(option =>
                            option.setName('state')
                                .setDescription('Maintenance mode state')
                                .setRequired(true)
                                .addChoices(
                                    { name: 'On (Enable Maintenance)', value: 'on' },
                                    { name: 'Off (Disable Maintenance)', value: 'off' }
                                )
                        )
                        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
                    new SlashCommandBuilder()
                        .setName('blacklist')
                        .setDescription('Manage the list of blacklisted nodes hidden from status embeds.')
                        .addSubcommand(subcommand =>
                            subcommand.setName('add')
                                .setDescription('Add a node to the blacklist')
                                .addStringOption(option =>
                                    option.setName('node')
                                        .setDescription('The node to add')
                                        .setRequired(true)
                                        .setAutocomplete(true)
                                )
                        )
                        .addSubcommand(subcommand =>
                            subcommand.setName('remove')
                                .setDescription('Remove a node from the blacklist')
                                .addStringOption(option =>
                                    option.setName('node')
                                        .setDescription('The node to remove')
                                        .setRequired(true)
                                        .setAutocomplete(true)
                                )
                        )
                        .addSubcommand(subcommand =>
                            subcommand.setName('list')
                                .setDescription('List all currently blacklisted nodes')
                        )
                        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
                );

                const commands = rawCommands.map(command => command.toJSON());

                logger.system("Registering slash commands...");
                await rest.put(
                    Routes.applicationCommands(client.user.id),
                    { body: commands }
                );
                logger.success("Slash commands successfully registered!");
            } catch (error) {
                logger.error("Failed to register slash commands: " + error.message);
            }
        };

        registerCommands();
        client.getStats(client);
    });

    async function showNodeDetailsCard(interaction, node) {
        const fs = require("node:fs");
        const path = require("node:path");
        const axios = require("axios");
        const convertUnits = require("./convertUnits.js");
        const uptimeFormatter = require("./uptimeFormatter.js");

        let accentColor = node.status ? 5793266 : 15548997; // Green for online, Red for offline
        let statusLabel = node.status ? "Online" : "Offline";
        if (node.maintenance) {
            accentColor = 10070709; // Grey/Tools color for maintenance
            statusLabel = "Maintenance";
        }

        const container = {
            type: 17, // Container
            accent_color: accentColor,
            components: []
        };

        container.components.push({
            type: 10, // TextDisplay
            content: `## 🖥️ Detailed Stats: ${node.attributes.name} - ${statusLabel}`
        });

        // Block 1: Node Info (FQDN & Uptime)
        const showFqdn = config.detailed_metrics?.show_fqdn !== false;
        const showUptime = config.detailed_metrics?.show_uptime !== false;

        let nodeInfo = "";
        if (showFqdn) {
            nodeInfo += `🌐 **Host/FQDN:** \`${node.attributes.fqdn}\``;
        }
        if (showUptime) {
            nodeInfo += `${nodeInfo ? "\n" : ""}⏱️ **Uptime:** ${node.uptime ? uptimeFormatter(Date.now() - node.uptime) : "*Offline / Unknown*"}`;
        }

        if (nodeInfo) {
            container.components.push({
                type: 10,
                content: nodeInfo
            });
        }

        // Block 2: Resource Allocation details
        const showAllocations = config.detailed_metrics?.show_allocations !== false;
        if (showAllocations) {
            if (container.components.length > 1) {
                container.components.push({ type: 14 }); // Separator
            }
            let allocInfo = 
                `### 📊 Allocation details\n` +
                `💾 **Allocated RAM:** \`${convertUnits(node.attributes.allocated_resources.memory, node.attributes.memory, config.nodes_settings.unit || 'byte')}\`\n` +
                `💿 **Allocated Disk:** \`${convertUnits(node.attributes.allocated_resources.disk, node.attributes.disk, config.nodes_settings.unit || 'byte')}\`\n` +
                `👥 **Servers:** \`${node.attributes.relationships.servers}\` active servers / \`${node.attributes.relationships.allocations}\` allocations`;

            container.components.push({
                type: 10,
                content: allocInfo
            });
        }

        // Block 3: Live System Specs (only if online and enabled)
        const showLiveDaemon = config.detailed_metrics?.show_live_daemon !== false;
        if (showLiveDaemon) {
            if (node.status) {
                try {
                    const overviewRes = await axios.get(`${new URL(process.env?.PanelURL).origin}/api/admin/nodes/${node.attributes.id}/system/overview`, {
                        headers: {
                            "Content-Type": "application/json",
                            "Authorization": `Bearer ${process.env?.PanelKEY}`
                        },
                        timeout: 5000
                    });
                    if (overviewRes.data) {
                        const o = overviewRes.data;
                        const usedRAM = (o.memory?.used_bytes || 0) / (1024 * 1024);
                        const totalRAM = (o.memory?.total_bytes || 0) / (1024 * 1024);

                        if (container.components.length > 1) {
                            container.components.push({ type: 14 }); // Separator
                        }

                        let liveInfo = 
                            `### ⚡ Host & Daemon metrics\n` +
                            `⚙️ **Wings Version:** \`${o.version || "Unknown"}\`\n` +
                            `🐧 **Kernel & Arch:** \`${o.kernel_version || "Unknown"} (${o.architecture || "Unknown"})\`\n` +
                            `🖥️ **CPU Model:** \`${o.cpu?.brand || "Unknown"}\` (${o.cpu?.cpu_count || "Unknown"} Cores)\n` +
                            `🔌 **Wings RAM:** \`${((o.memory?.used_bytes_process || 0) / (1024 * 1024)).toFixed(2)} MiB\`\n` +
                            `📈 **Host RAM Usage:** \`${convertUnits(usedRAM, totalRAM, 'byte')}\`\n` +
                            `🎮 **Server Status:** \`${o.servers?.online || 0}\` online / \`${o.servers?.offline || 0}\` offline (\`${o.servers?.total || 0}\` total)`;

                        container.components.push({
                            type: 10,
                            content: liveInfo
                        });
                    }
                } catch (err) {
                    if (container.components.length > 1) {
                        container.components.push({ type: 14 }); // Separator
                    }
                    container.components.push({
                        type: 10,
                        content: `⚠️ *Live host/daemon metrics currently unavailable (query failed)*`
                    });
                }
            } else {
                if (container.components.length > 1) {
                    container.components.push({ type: 14 }); // Separator
                }
                container.components.push({
                    type: 10,
                    content: `⚠️ *Live metrics unavailable because the daemon is offline.*`
                });
            }
        }

        // Block 4: Capacity Allocation Chart (ephemeral card)
        const showChart = config.detailed_metrics?.chart !== false;
        if (showChart) {
            const labels = ['Memory', 'Disk'];
            const allocatedData = [
                Math.round(node.attributes.allocated_resources.memory / 102.4) / 10,
                Math.round(node.attributes.allocated_resources.disk / 102.4) / 10
            ];
            const freeData = [
                Math.max(0, Math.round((node.attributes.memory - node.attributes.allocated_resources.memory) / 102.4) / 10),
                Math.max(0, Math.round((node.attributes.disk - node.attributes.allocated_resources.disk) / 102.4) / 10)
            ];

            const chartConfig = {
                type: 'horizontalBar',
                data: {
                    labels: labels,
                    datasets: [
                        {
                            label: 'Allocated (GB)',
                            data: allocatedData,
                            backgroundColor: '#5865F2'
                        },
                        {
                            label: 'Free (GB)',
                            data: freeData,
                            backgroundColor: 'rgba(255, 255, 255, 0.1)'
                        }
                    ]
                },
                options: {
                    legend: {
                        labels: {
                            fontColor: '#dbdee1',
                            fontSize: 10
                        }
                    },
                    title: {
                        display: true,
                        text: 'Node Capacity Allocation (GB)',
                        fontColor: '#f2f3f5',
                        fontSize: 12
                    },
                    scales: {
                        xAxes: [{
                            stacked: true,
                            ticks: {
                                fontColor: '#949ba4',
                                beginAtZero: true,
                                fontSize: 9
                            },
                            gridLines: {
                                color: '#3f4248'
                            }
                        }],
                        yAxes: [{
                            stacked: true,
                            ticks: {
                                fontColor: '#949ba4',
                                fontSize: 9
                            },
                            gridLines: {
                                color: '#3f4248'
                            }
                        }]
                    }
                }
            };

            const chartUrl = `https://quickchart.io/chart?bkg=%232b2d31&w=500&h=200&c=${encodeURIComponent(JSON.stringify(chartConfig))}`;

            if (container.components.length > 1) {
                container.components.push({ type: 14 }); // Separator
            }

            container.components.push({
                type: 12, // MediaGallery
                items: [
                    {
                        media: {
                            url: chartUrl
                        },
                        description: "Capacity Allocation Chart"
                    }
                ]
            });
        }

        if (container.components.length > 1) {
            container.components.push({ type: 14 }); // Separator
        }

        container.components.push({
            type: 10, // TextDisplay
            content: `*Stats retrieved: <t:${Math.floor(Date.now() / 1000)}:R>*`
        });

        // Add detailed card control buttons
        const buttonsRow = {
            type: 1, // ActionRow
            components: [
                {
                    type: 2, // Button
                    style: 1, // Primary (blue)
                    label: "Refresh",
                    custom_id: `refresh_node:${node.attributes.id}`,
                    emoji: { name: "🔄" }
                },
                {
                    type: 2, // Button
                    style: 2, // Secondary (grey)
                    label: "Ping Daemon",
                    custom_id: `ping_daemon:${node.attributes.id}`,
                    emoji: { name: "⚡" }
                }
            ]
        };

        const isAdmin = interaction.member && interaction.member.permissions && interaction.member.permissions.has(PermissionFlagsBits.Administrator);
        if (isAdmin) {
            buttonsRow.components.push({
                type: 2, // Button
                style: node.maintenance ? 3 : 4, // Success (green) if in maintenance, Danger (red) if not
                label: node.maintenance ? "Disable Maint." : "Enable Maint.",
                custom_id: `toggle_maint:${node.attributes.id}`,
                emoji: { name: "🛠️" }
            });
        }

        container.components.push({ type: 14 }); // Separator
        container.components.push(buttonsRow);

        const wrappedContainer = makeRaw(container);

        await interaction.editReply({
            components: [wrappedContainer],
            flags: 32768 // MessageFlags.IsComponentsV2
        });
    }

    client.on("interactionCreate", async (interaction) => {
        // 0. Handle Button Interactions for Node Detail Cards
        if (interaction.isButton()) {
            const customId = interaction.customId;
            if (customId.startsWith("refresh_node:") || customId.startsWith("ping_daemon:") || customId.startsWith("toggle_maint:")) {
                await interaction.deferUpdate();

                const nodeId = customId.split(":")[1];
                const fs = require("node:fs");
                const path = require("node:path");

                let cache = null;
                try {
                    cache = JSON.parse(fs.readFileSync(path.join(__dirname, "../cache.json"), "utf8"));
                } catch (err) {
                    return interaction.followUp({ content: "❌ Failed to read cached statistics.", ephemeral: true });
                }

                let node = cache.nodes.find(n => n.attributes.id === nodeId);
                if (!node) {
                    return interaction.followUp({ content: "❌ Node not found in cache.", ephemeral: true });
                }

                if (customId.startsWith("refresh_node:")) {
                    const getWingsStatus = require("./getWingsStatus.js");
                    const axios = require("axios");

                    const nodeStatusResult = await getWingsStatus(node).catch(() => ({ online: false }));
                    node.status = nodeStatusResult?.online || false;
                    
                    if (!node.status) {
                        node.uptime = false;
                    } else if (!node.uptime) {
                        node.uptime = Date.now();
                    }

                    if (node.status && config.nodes_settings.live_resources) {
                        try {
                            const statsRes = await axios(`${new URL(process.env?.PanelURL).origin}/api/admin/nodes/${node.attributes.id}/system/stats`, {
                                method: "GET",
                                headers: {
                                    "Content-Type": "application/json",
                                    "Authorization": `Bearer ${process.env?.PanelKEY}`
                                },
                                timeout: 3000
                            });
                            if (statsRes.data && statsRes.data.stats) {
                                const stats = statsRes.data.stats;
                                if (stats.memory) {
                                    node.attributes.allocated_resources.memory = Math.round(stats.memory.used / (1024 * 1024));
                                    node.attributes.memory = Math.round(stats.memory.total / (1024 * 1024));
                                }
                                if (stats.disk) {
                                    node.attributes.allocated_resources.disk = Math.round(stats.disk.used / (1024 * 1024));
                                    node.attributes.disk = Math.round(stats.disk.total / (1024 * 1024));
                                }
                                if (stats.cpu) {
                                    node.attributes.allocated_resources.cpu = (Math.round(stats.cpu.used * 10) / 10).toFixed(1);
                                }
                            }
                        } catch (err) {}
                    }

                    const idx = cache.nodes.findIndex(n => n.attributes.id === nodeId);
                    if (idx !== -1) {
                        cache.nodes[idx] = node;
                        fs.writeFileSync(path.join(__dirname, "../cache.json"), JSON.stringify(cache, null, 2), "utf8");
                    }

                    await showNodeDetailsCard(interaction, node);
                } 
                
                else if (customId.startsWith("ping_daemon:")) {
                    const axios = require("axios");
                    const start = Date.now();
                    let pingText = "";
                    try {
                        await axios(`${new URL(process.env?.PanelURL).origin}/api/admin/nodes/${node.attributes.id}/system/overview`, {
                            method: "GET",
                            headers: {
                                "Content-Type": "application/json",
                                "Authorization": `Bearer ${process.env?.PanelKEY}`
                            },
                            timeout: 4000
                        });
                        const latency = Date.now() - start;
                        pingText = `⚡ **Daemon Ping round-trip latency:** \`${latency}ms\``;
                    } catch (err) {
                        pingText = `❌ **Daemon Ping failed:** Daemon is offline or unreachable.`;
                    }
                    return interaction.followUp({ content: pingText, ephemeral: true });
                } 
                
                else if (customId.startsWith("toggle_maint:")) {
                    let maintenanceList = [];
                    try {
                        maintenanceList = JSON.parse(fs.readFileSync(path.join(__dirname, "../maintenance.json"), "utf8"));
                    } catch (err) {}

                    const isCurrentlyMaint = maintenanceList.includes(nodeId);
                    if (isCurrentlyMaint) {
                        maintenanceList = maintenanceList.filter(id => id !== nodeId);
                        node.maintenance = false;
                    } else {
                        maintenanceList.push(nodeId);
                        node.maintenance = true;
                    }

                    fs.writeFileSync(path.join(__dirname, "../maintenance.json"), JSON.stringify(maintenanceList, null, 2), "utf8");

                    client.getStats(client).catch(() => null);

                    await showNodeDetailsCard(interaction, node);
                }
                return;
            }
        }

        // 1. Handle Slash Command Autocomplete
        if (interaction.isAutocomplete()) {
            const focusedValue = interaction.options.getFocused().toLowerCase();

            if (interaction.commandName === 'node' || interaction.commandName === 'stats' || interaction.commandName === 'maintenance') {
                const fs = require("node:fs");
                const path = require("node:path");

                let cache = null;
                try {
                    cache = JSON.parse(fs.readFileSync(path.join(__dirname, "../cache.json"), "utf8"));
                } catch (err) {}

                if (!cache || !cache.nodes) {
                    return interaction.respond([]);
                }

                const filtered = cache.nodes.filter(node => 
                    node.attributes.name.toLowerCase().includes(focusedValue)
                );

                return interaction.respond(
                    filtered.slice(0, 25).map(node => ({
                        name: node.attributes.name,
                        value: node.attributes.name
                    }))
                );
            }

            if (interaction.commandName === 'blacklist') {
                const subcommand = interaction.options.getSubcommand();
                const nodesList = await getAllNodesFromPanel();
                const blacklistedUUIDs = config.nodes_settings.blacklist || [];

                let filteredNodes = [];
                if (subcommand === 'add') {
                    // Suggest nodes that are NOT blacklisted
                    filteredNodes = nodesList.filter(n => 
                        !blacklistedUUIDs.includes(n.uuid) &&
                        (n.name.toLowerCase().includes(focusedValue) || n.uuid.toLowerCase().includes(focusedValue))
                    );
                } else if (subcommand === 'remove') {
                    // Suggest nodes that ARE blacklisted
                    filteredNodes = nodesList.filter(n => 
                        blacklistedUUIDs.includes(n.uuid) &&
                        (n.name.toLowerCase().includes(focusedValue) || n.uuid.toLowerCase().includes(focusedValue))
                    );
                }

                return interaction.respond(
                    filteredNodes.slice(0, 25).map(n => ({
                        name: n.name,
                        value: n.name
                    }))
                );
            }
            return;
        }

        // 2. Handle Slash Command Interactions
        if (interaction.isChatInputCommand()) {
            if (interaction.commandName === 'help') {
                const embedColor = config.embed?.panel?.color ? (config.embed.panel.color.startsWith("#") ? config.embed.panel.color : `#${config.embed.panel.color}`) : "#5865F2";
                
                const helpEmbed = new EmbedBuilder()
                    .setTitle("CalagopusStats Help Menu")
                    .setDescription("CalagopusStats is a premium Discord bot that monitors your Calagopus/Pterodactyl nodes and servers, displaying real-time stats and metrics directly in your server.")
                    .setColor(embedColor)
                    .setThumbnail(client.user.displayAvatarURL())
                    .addFields(
                        {
                            name: "📊 General Commands",
                            value: 
                                "`/stats` - Display panel statistics and list of online/offline nodes.\n" +
                                "`/node <name>` - View detailed resource usage, CPU/RAM allocations, and Wings status for a specific node.\n" +
                                "`/history` - View a 24-hour visual trend chart showing Panel growth and RAM allocations.\n" +
                                "`/ping` - Verify the bot latency and API connection speeds."
                        },
                        {
                            name: "⚙️ Admin Commands",
                            value:
                                "`/refresh` - Force an immediate refresh of the main status message card.\n" +
                                "`/maintenance <node> <on/off>` - Toggle maintenance mode on a node to silence alert notifications.\n" +
                                "`/blacklist <add/remove> <node>` - Exclude or restore a node from the main status embeds.\n" +
                                "`/alert-test` - Dispatches mock node online/offline cards to test notification webhooks.\n" +
                                "`/panel-sysinfo` - View specifications, hardware details, OS info, and database sizes of the Panel host."
                        }
                    )
                    .setFooter({ text: "CalagopusStats Help Dashboard", iconURL: client.user.displayAvatarURL() })
                    .setTimestamp();

                const buttons = new ActionRowBuilder()
                    .addComponents(
                        new ButtonBuilder()
                            .setLabel("GitHub Code")
                            .setStyle(ButtonStyle.Link)
                            .setURL("https://github.com/heyitslumi/CalagopusStats")
                            .setEmoji("💻"),
                        new ButtonBuilder()
                            .setLabel("Documentation")
                            .setStyle(ButtonStyle.Link)
                            .setURL("https://github.com/heyitslumi/CalagopusStats#readme")
                            .setEmoji("📖"),
                        new ButtonBuilder()
                            .setLabel("Report Issues")
                            .setStyle(ButtonStyle.Link)
                            .setURL("https://github.com/heyitslumi/CalagopusStats/issues")
                            .setEmoji("🐛")
                    );

                return interaction.reply({ embeds: [helpEmbed], components: [buttons], ephemeral: true });
            }

            if (interaction.commandName === 'ping') {
                const sent = await interaction.reply({ content: 'Pinging...', fetchReply: true, ephemeral: true });
                const latency = sent.createdTimestamp - interaction.createdTimestamp;
                return interaction.editReply(`🏓 **Pong!**\nGateway Latency: \`${client.ws.ping}ms\`\nAPI Latency: \`${latency}ms\``);
            }

            if (interaction.commandName === 'history') {
                if (config.history_settings?.enable === false) {
                    return interaction.reply({ content: "⚠️ The history command is currently disabled in the configuration.", ephemeral: true });
                }
                await interaction.deferReply({ ephemeral: true });

                const fs = require("node:fs");
                const path = require("node:path");

                const historyPath = path.join(__dirname, "../history.json");
                if (!fs.existsSync(historyPath)) {
                    return interaction.editReply("⚠️ No historical data collected yet. Please wait for the bot to collect data points.");
                }

                let history = [];
                try {
                    history = JSON.parse(fs.readFileSync(historyPath, "utf8"));
                } catch (err) {
                    return interaction.editReply("❌ Failed to parse historical data.");
                }

                if (history.length < 2) {
                    return interaction.editReply("⚠️ Not enough historical data collected yet. Please wait for the bot to collect more data points.");
                }

                const labels = history.map(h => {
                    const d = new Date(h.timestamp);
                    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
                });
                const serversData = history.map(h => h.servers);
                const ramData = history.map(h => Math.round(h.memoryAllocated / 102.4) / 10); // GB

                const chartConfig = {
                    type: 'line',
                    data: {
                        labels: labels,
                        datasets: [
                            {
                                label: 'Servers',
                                data: serversData,
                                borderColor: '#5865F2',
                                backgroundColor: 'rgba(88, 101, 242, 0.1)',
                                yAxisID: 'y1',
                                fill: true
                            },
                            {
                                label: 'RAM (GB)',
                                data: ramData,
                                borderColor: '#57F287',
                                yAxisID: 'y2'
                            }
                        ]
                    },
                    options: {
                        title: {
                            display: true,
                            text: '24-Hour Growth & Resource Trends',
                            fontColor: '#f2f3f5',
                            fontSize: 14
                        },
                        legend: {
                            labels: { fontColor: '#dbdee1' }
                        },
                        scales: {
                            yAxes: [
                                {
                                    id: 'y1',
                                    ticks: { fontColor: '#5865F2', beginAtZero: true },
                                    gridLines: { color: '#3f4248' }
                                },
                                {
                                    id: 'y2',
                                    position: 'right',
                                    ticks: { fontColor: '#57F287', beginAtZero: true },
                                    gridLines: { drawOnChartArea: false }
                                }
                            ],
                            xAxes: [{
                                ticks: { fontColor: '#949ba4' },
                                gridLines: { color: '#3f4248' }
                            }]
                        }
                    }
                };

                const chartUrl = `https://quickchart.io/chart?bkg=%232b2d31&w=600&h=300&c=${encodeURIComponent(JSON.stringify(chartConfig))}`;

                const container = {
                    type: 17, // Container
                    accent_color: 5793010, // Discord Blurple
                    components: [
                        {
                            type: 12, // MediaGallery
                            items: [
                                {
                                    media: {
                                        url: chartUrl
                                    },
                                    description: "Historical Trends Chart"
                                }
                            ]
                        }
                    ]
                };

                return interaction.editReply({
                    components: [makeRaw(container)],
                    flags: 32768 // MessageFlags.IsComponentsV2
                });
            }

            if (interaction.commandName === 'refresh') {
                await interaction.reply({ content: '🔄 Force-refreshing panel stats card...', ephemeral: true });
                try {
                    await client.getStats(client);
                    return interaction.editReply('✅ Panel stats card successfully refreshed!');
                } catch (err) {
                    return interaction.editReply('❌ Failed to refresh stats card.');
                }
            }

            if (interaction.commandName === 'stats') {
                await interaction.deferReply({ ephemeral: true });
                const fs = require("node:fs");
                const path = require("node:path");

                let cache = null;
                try {
                    cache = JSON.parse(fs.readFileSync(path.join(__dirname, "../cache.json"), "utf8"));
                } catch (err) {
                    return interaction.editReply("Failed to read cached statistics.");
                }

                const nodeName = interaction.options.getString('node');
                if (nodeName) {
                    const node = cache.nodes.find(n => n.attributes.name.toLowerCase() === nodeName.toLowerCase());
                    if (!node) {
                        return interaction.editReply(`❌ Node \`${nodeName}\` not found in cache. Available nodes: ${cache.nodes.map(n => `\`${n.attributes.name}\``).join(", ")}`);
                    }
                    await showNodeDetailsCard(interaction, node);
                    return;
                }

                const container = {
                    type: 17, // Container
                    accent_color: 5793266,
                    components: []
                };

                container.components.push({
                    type: 10,
                    content: `## 📊 Quick Status Summary`
                });

                let statusContent = `🌐 **Panel Uptime:** ${cache.uptime ? "Online" : "Offline"}\n` +
                    `👥 **Total Users:** \`${cache.users}\` | 🎮 **Total Servers:** \`${cache.servers}\`\n\n` +
                    `### 🖥️ Nodes Status:\n`;

                cache.nodes.forEach(node => {
                    let emoji = node.status ? "🟢" : "🔴";
                    let statusLabel = node.status ? "Online" : "Offline";
                    if (node.maintenance) {
                        emoji = "🛠️";
                        statusLabel = "Maintenance";
                    }
                    statusContent += `${emoji} **${node.attributes.name}**: \`${statusLabel}\` (${node.attributes.fqdn})\n`;
                });

                container.components.push({
                    type: 10,
                    content: statusContent
                });

                await interaction.editReply({
                    components: [makeRaw(container)],
                    flags: 32768
                });
            }

            if (interaction.commandName === 'node') {
                await interaction.deferReply({ ephemeral: true });
                const nodeName = interaction.options.getString('name');

                const fs = require("node:fs");
                const path = require("node:path");

                let cache = null;
                try {
                    cache = JSON.parse(fs.readFileSync(path.join(__dirname, "../cache.json"), "utf8"));
                } catch (err) {
                    return interaction.editReply("Failed to read cached statistics.");
                }

                const node = cache.nodes.find(n => n.attributes.name.toLowerCase() === nodeName.toLowerCase());
                if (!node) {
                    return interaction.editReply(`❌ Node \`${nodeName}\` not found in cache. Available nodes: ${cache.nodes.map(n => `\`${n.attributes.name}\``).join(", ")}`);
                }

                await showNodeDetailsCard(interaction, node);
            }

            if (interaction.commandName === 'alert-test') {
                await interaction.deferReply({ ephemeral: true });
                if (!config.notifier?.enable) {
                    return interaction.editReply("❌ Webhook notifications are currently disabled in configuration (`config.yml`).");
                }
                const webhook = require("./webhook.js");
                const { EmbedBuilder } = require("discord.js");

                await webhook(
                    new EmbedBuilder()
                        .setTitle("Offline Alert Test")
                        .setColor("ED4245")
                        .setDescription("This is a mock offline alert to test your notifier webhook configuration."),
                    "TestNode"
                );

                await webhook(
                    new EmbedBuilder()
                        .setTitle("Online Alert Test")
                        .setColor("57F287")
                        .setDescription("This is a mock online alert to test your notifier webhook configuration."),
                    "TestNode"
                );

                return interaction.editReply("✅ Mock alerts sent successfully to the webhook!");
            }

            if (interaction.commandName === 'panel-sysinfo') {
                await interaction.deferReply({ ephemeral: true });
                const axios = require("axios");
                const convertUnits = require("./convertUnits.js");

                try {
                    const overviewRes = await axios(`${new URL(process.env?.PanelURL).origin}/api/admin/system/overview`, {
                        method: "GET",
                        headers: {
                            "Content-Type": "application/json",
                            "Authorization": `Bearer ${process.env?.PanelKEY}`
                        },
                        timeout: 5000
                    });

                    const statsRes = await axios(`${new URL(process.env?.PanelURL).origin}/api/admin/stats/general`, {
                        method: "GET",
                        headers: {
                            "Content-Type": "application/json",
                            "Authorization": `Bearer ${process.env?.PanelKEY}`
                        },
                        timeout: 5000
                    }).catch(() => null);

                    if (!overviewRes.data) {
                        return interaction.editReply("❌ Failed to query Panel System Overview.");
                    }

                    const o = overviewRes.data;
                    const stats = statsRes?.data?.stats;

                    const container = {
                        type: 17, // Container
                        accent_color: 3447003, // Blurple
                        components: []
                    };

                    container.components.push({
                        type: 10,
                        content: `## 🖥️ Panel Server System Information`
                    });

                    // OS & Specs
                    let systemInfo = `⚙️ **Calagopus Version:** \`${o.version || "Unknown"}\` (${o.container_type || "Bare metal"})\n` +
                        `🐧 **Kernel & Arch:** \`${o.kernel_version || "Unknown"} (${o.architecture || "Unknown"})\`\n` +
                        `🖥️ **CPU Model:** \`${o.cpu?.brand || "Unknown"}\` (${o.cpu?.cpu_count || "Unknown"} Cores)\n` +
                        `🔌 **Process RAM:** \`${((o.memory?.used_bytes_process || 0) / (1024 * 1024)).toFixed(2)} MiB\`\n` +
                        `📈 **Host RAM Usage:** \`${((o.memory?.used_bytes || 0) / (1024 * 1024 * 1024)).toFixed(2)} GB\` / \`${((o.memory?.total_bytes || 0) / (1024 * 1024 * 1024)).toFixed(2)} GB\`\n` +
                        `💾 **DB Size:** \`${((o.database?.size_bytes || 0) / (1024 * 1024)).toFixed(2)} MiB\` (Engine: \`${o.database?.version || "Unknown"}\`)`;

                    container.components.push({
                        type: 10,
                        content: systemInfo
                    });

                    if (stats) {
                        container.components.push({ type: 14 }); // Separator
                        let statsInfo = `### 📊 Panel Stats Overview\n` +
                            `👥 **Total Users:** \`${stats.users || 0}\` | 🎮 **Total Servers:** \`${stats.servers || 0}\`\n` +
                            `📍 **Locations:** \`${stats.locations || 0}\` | 🖥️ **Nodes count:** \`${stats.nodes || 0}\`\n` +
                            `🥚 **Nests & Eggs:** \`${stats.nest_eggs || 0}\` | 🛢️ **DB Hosts:** \`${stats.database_hosts || 0}\``;
                        container.components.push({
                            type: 10,
                            content: statsInfo
                        });
                    }

                    await interaction.editReply({
                        components: [makeRaw(container)],
                        flags: 32768
                    });

                } catch (err) {
                    console.error(err);
                    return interaction.editReply("❌ Failed to fetch Panel system info: " + err.message);
                }
            }

            if (interaction.commandName === 'maintenance') {
                await interaction.deferReply({ ephemeral: true });
                const nodeInput = interaction.options.getString('node');
                const state = interaction.options.getString('state');

                const fs = require("node:fs");
                const path = require("node:path");

                let cache = null;
                try {
                    cache = JSON.parse(fs.readFileSync(path.join(__dirname, "../cache.json"), "utf8"));
                } catch (err) {}

                let matchedNode = null;
                if (cache && cache.nodes) {
                    matchedNode = cache.nodes.find(n => 
                        n.attributes.name.toLowerCase() === nodeInput.toLowerCase() || 
                        n.attributes.id === nodeInput
                    );
                }

                if (!matchedNode) {
                    const axios = require("axios");
                    try {
                        const res = await axios(`${new URL(process.env?.PanelURL).origin}/api/admin/nodes?page=1&per_page=100`, {
                            method: "GET",
                            headers: {
                                "Content-Type": "application/json",
                                "Authorization": `Bearer ${process.env?.PanelKEY}`
                            },
                            timeout: 3000
                        });
                        const nodes = res.data && res.data.nodes && res.data.nodes.data ? res.data.nodes.data : [];
                        const found = nodes.find(n => n.name.toLowerCase() === nodeInput.toLowerCase() || n.uuid === nodeInput);
                        if (found) {
                            matchedNode = { attributes: { id: found.uuid, name: found.name } };
                        }
                    } catch (err) {}
                }

                if (!matchedNode) {
                    return interaction.editReply(`❌ Node \`${nodeInput}\` was not found on the panel.`);
                }

                const nodeUUID = matchedNode.attributes.id;
                const nodeName = matchedNode.attributes.name;

                let maintenanceList = [];
                try {
                    maintenanceList = JSON.parse(fs.readFileSync(path.join(__dirname, "../maintenance.json"), "utf8"));
                } catch (err) {}

                if (state === 'on') {
                    if (!maintenanceList.includes(nodeUUID)) {
                        maintenanceList.push(nodeUUID);
                    }
                    fs.writeFileSync(path.join(__dirname, "../maintenance.json"), JSON.stringify(maintenanceList, null, 2), "utf8");
                    client.getStats(client).catch(() => null);

                    return interaction.editReply(`✅ Enabled maintenance mode for node **${nodeName}** (\`${nodeUUID}\`). Alert notifications for this node are now silenced and it will show as maintenance on the status card.`);
                } else {
                    maintenanceList = maintenanceList.filter(id => id !== nodeUUID && id !== nodeName);
                    fs.writeFileSync(path.join(__dirname, "../maintenance.json"), JSON.stringify(maintenanceList, null, 2), "utf8");
                    client.getStats(client).catch(() => null);

                    return interaction.editReply(`✅ Disabled maintenance mode for node **${nodeName}** (\`${nodeUUID}\`). Node alert notifications and public status display have been resumed.`);
                }
            }

            if (interaction.commandName === 'blacklist') {
                await interaction.deferReply({ ephemeral: true });
                const subcommand = interaction.options.getSubcommand();
                const fs = require("node:fs");
                const path = require("node:path");

                if (subcommand === 'list') {
                    const blacklist = config.nodes_settings.blacklist || [];
                    if (blacklist.length === 0) {
                        return interaction.editReply("ℹ️ There are currently no blacklisted nodes.");
                    }
                    
                    let nodesList = [];
                    const axios = require("axios");
                    try {
                        const res = await axios(`${new URL(process.env?.PanelURL).origin}/api/admin/nodes?page=1&per_page=100`, {
                            method: "GET",
                            headers: {
                                "Content-Type": "application/json",
                                "Authorization": `Bearer ${process.env?.PanelKEY}`
                            },
                            timeout: 3000
                        });
                        nodesList = res.data && res.data.nodes && res.data.nodes.data ? res.data.nodes.data : [];
                    } catch (err) {}

                    const listText = blacklist.map(uuid => {
                        const found = nodesList.find(n => n.uuid === uuid);
                        return `- **${found ? found.name : "Unknown node"}** (\`${uuid}\`)`;
                    }).join("\n");

                    return interaction.editReply(`### 🚫 Blacklisted Nodes (hidden from status card):\n${listText}`);
                }

                const nodeInput = interaction.options.getString('node');
                let nodesList = [];
                const axios = require("axios");
                try {
                    const res = await axios(`${new URL(process.env?.PanelURL).origin}/api/admin/nodes?page=1&per_page=100`, {
                        method: "GET",
                        headers: {
                            "Content-Type": "application/json",
                            "Authorization": `Bearer ${process.env?.PanelKEY}`
                        },
                        timeout: 3000
                    });
                    nodesList = res.data && res.data.nodes && res.data.nodes.data ? res.data.nodes.data : [];
                } catch (err) {
                    return interaction.editReply("❌ Failed to query nodes list from the panel: " + err.message);
                }

                const matchedNode = nodesList.find(n => n.name.toLowerCase() === nodeInput.toLowerCase() || n.uuid === nodeInput);
                if (!matchedNode) {
                    return interaction.editReply(`❌ Node \`${nodeInput}\` was not found on the panel.`);
                }

                const nodeUUID = matchedNode.uuid;
                const nodeName = matchedNode.name;

                if (!config.nodes_settings.blacklist) {
                    config.nodes_settings.blacklist = [];
                }

                if (subcommand === 'add') {
                    if (config.nodes_settings.blacklist.includes(nodeUUID)) {
                        return interaction.editReply(`ℹ️ Node **${nodeName}** is already blacklisted.`);
                    }

                    config.nodes_settings.blacklist.push(nodeUUID);

                    const fileToModify = fs.existsSync(path.join(__dirname, "../config-dev.yml")) ? "../config-dev.yml" : "../config.yml";
                    const configPath = path.join(__dirname, fileToModify);
                    let configContent = fs.readFileSync(configPath, "utf8");
                    configContent = configContent.replace(
                        /^\s*blacklist:.*$/m,
                        `  blacklist: [${config.nodes_settings.blacklist.map(id => `"${id}"`).join(", ")}] # Add node UUIDs to exclude them from the status embed (e.g., blacklist: ["123e4567-e89b-12d3-a456-426614174000"]).`
                    );
                    fs.writeFileSync(configPath, configContent, "utf8");

                    client.getStats(client).catch(() => null);

                    return interaction.editReply(`✅ Added node **${nodeName}** to the blacklist. It will now be hidden from the status card.`);
                } else if (subcommand === 'remove') {
                    if (!config.nodes_settings.blacklist.includes(nodeUUID)) {
                        return interaction.editReply(`ℹ️ Node **${nodeName}** is not currently blacklisted.`);
                    }

                    config.nodes_settings.blacklist = config.nodes_settings.blacklist.filter(id => id !== nodeUUID);

                    const fileToModify = fs.existsSync(path.join(__dirname, "../config-dev.yml")) ? "../config-dev.yml" : "../config.yml";
                    const configPath = path.join(__dirname, fileToModify);
                    let configContent = fs.readFileSync(configPath, "utf8");
                    configContent = configContent.replace(
                        /^\s*blacklist:.*$/m,
                        `  blacklist: [${config.nodes_settings.blacklist.map(id => `"${id}"`).join(", ")}] # Add node UUIDs to exclude them from the status embed (e.g., blacklist: ["123e4567-e89b-12d3-a456-426614174000"]).`
                    );
                    fs.writeFileSync(configPath, configContent, "utf8");

                    client.getStats(client).catch(() => null);

                    return interaction.editReply(`✅ Removed node **${nodeName}** from the blacklist. It will now be visible again on the status card.`);
                }
            }
        }

        // 3. Handle Dropdown (Select Menu) Interactions
        if (interaction.isStringSelectMenu()) {
            if (interaction.customId !== "select_node_details") return;
            if (!config.detailed_metrics?.enable) return;

            await interaction.deferReply({ ephemeral: true });

            const fs = require("node:fs");
            const path = require("node:path");

            let cache = null;
            try {
                cache = JSON.parse(fs.readFileSync(path.join(__dirname, "../cache.json"), "utf8"));
            } catch (err) {
                return interaction.editReply({ content: "Failed to read cached statistics." });
            }

            const selectedValue = interaction.values[0];
            const node = cache.nodes.find(n => n.attributes.id === selectedValue || n.attributes.name === selectedValue);

            if (!node) {
                return interaction.editReply({ content: "Node not found in cache." });
            }

            await showNodeDetailsCard(interaction, node);
        }
    });

    try {
        client.login(process.env?.DiscordBotToken);
    } catch {
        logger.error("Discord Error | Invalid Discord Bot Token! Make sure you have the correct token in the config!");
        process.exit();
    }
}