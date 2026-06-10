const uptimeFormatter = require("./uptimeFormatter.js");
const convertUnits = require("./convertUnits.js");
const errorLogging = require("./errorLogging.js");
const config = require("./configuration.js");
const cliColor = require("cli-color");

const colorToInt = (hex) => {
    if (!hex) return 5793010; // default discord blurple
    hex = hex.replace('#', '');
    const num = parseInt(hex, 16);
    return isNaN(num) ? 5793010 : num;
};

const getAccessory = (url) => {
    if (!url) return null;
    return {
        type: 11, // Thumbnail (v2)
        media: { url }
    };
};

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

module.exports = async function sendMessage({ client, cache, panel, uptime, nodes, servers, users, panelOverview, rateLimited, delay }) {
    const finalComponents = [];

    // 1. Render Panel Status Container
    if (config.panel_settings.status) {
        let panelAccentColor = panel ? colorToInt(config.embed.panel.color) : 15548997;
        if (rateLimited) {
            panelAccentColor = 16705372; // Yellow for warning/cooldown (hex 0xfebc5c)
        }

        const panelContainer = {
            type: 17, // Container
            accent_color: panelAccentColor,
            components: []
        };

        const title = config.embed.panel.title || "Panel Stats";
        let headerContent = `## ${title}`;
        if (config.embed.panel.description) {
            const nextTime = new Date(Date.now() + (config.refresh * 1000) + 1000);
            const desc = config.embed.panel.description.replace(
                "{{time}}",
                `<t:${Math.floor(nextTime.getTime() / 1000)}:R>`
            );
            headerContent += `\n${desc}`;
        }

        const panelAcc = getAccessory(config.embed.panel.thumbnail);
        if (panelAcc) {
            panelContainer.components.push({
                type: 9, // Section
                components: [
                    {
                        type: 10, // TextDisplay
                        content: headerContent
                    }
                ],
                accessory: panelAcc
            });
        } else {
            panelContainer.components.push({
                type: 10, // TextDisplay
                content: headerContent
            });
        }

        // Body Details
        let panelValue = "```\n" +
            (config.panel_settings.host ? `Host   : ${new URL(process.env.PanelURL).host}\n` : "") +
            `Nodes  : ${(nodes || []).length}\n` +
            (config.panel_settings.servers ? `Servers: ${servers || "Unknown"}\n` : "") +
            (config.panel_settings.users ? `Users  : ${users || "Unknown"}\n` : "");

        if (config.panel_settings.hardware_details && panelOverview) {
            if (panelOverview.cpu) {
                panelValue += `CPU    : ${panelOverview.cpu.brand} (${panelOverview.cpu.cpu_count} Cores)\n`;
            }
            if (panelOverview.memory) {
                const usedMB = panelOverview.memory.used_bytes / (1024 * 1024);
                const totalMB = panelOverview.memory.total_bytes / (1024 * 1024);
                panelValue += `Memory : ${convertUnits(usedMB, totalMB, 'byte')}\n`;
            }
            if (panelOverview.database) {
                const dbMB = panelOverview.database.size_bytes / (1024 * 1024);
                panelValue += `DB Size: ${convertUnits(dbMB, 0, 'byte').split(' / ')[0]}\n`;
            }
        }

        panelValue += (config.panel_settings.uptime ? `Uptime : ${uptime ? uptimeFormatter(Date.now() - uptime) : "N/A"}\n` : "") + "```";

        let panelStatusText = panel ? config.status.online : config.status.offline;
        if (rateLimited) {
            panelStatusText = "⚠️ Rate Limited (Cooldown)";
        }

        panelContainer.components.push({
            type: 10, // TextDisplay
            content: `### Panel - ${panelStatusText}\n${panelValue}`
        });

        finalComponents.push(panelContainer);
    }

    // 2. Render Nodes Status Container
    if (nodes && nodes.length > 0) {
        let nodesContainer = {
            type: 17, // Container
            accent_color: colorToInt(config.embed.nodes.color),
            components: []
        };
        finalComponents.push(nodesContainer);

        // Header for Nodes
        let nodesHeaderContent = "";
        if (config.embed.nodes.title) {
            nodesHeaderContent += `## ${config.embed.nodes.title}`;
        }
        if (config.embed.nodes.description) {
            nodesHeaderContent += (nodesHeaderContent ? "\n" : "") + config.embed.nodes.description;
        }

        const nodesAcc = getAccessory(config.embed.nodes.thumbnail);
        if (nodesHeaderContent) {
            if (nodesAcc) {
                nodesContainer.components.push({
                    type: 9, // Section
                    components: [
                        {
                            type: 10, // TextDisplay
                            content: nodesHeaderContent
                        }
                    ],
                    accessory: nodesAcc
                });
            } else {
                nodesContainer.components.push({
                    type: 10, // TextDisplay
                    content: nodesHeaderContent
                });
            }
        }

        if (config.nodes_settings.details) {
            nodes.forEach((node) => {
                // Maximum 10 components inside a single Container.
                if (nodesContainer.components.length >= 10) {
                    nodesContainer = {
                        type: 17, // Container
                        accent_color: colorToInt(config.embed.nodes.color),
                        components: []
                    };
                    finalComponents.push(nodesContainer);
                }

                const nodeValue = "```\n" +
                    (config.nodes_settings.host ? `Host   : ${node.attributes.fqdn}\n` : "") +
                    `Memory : ${convertUnits(node.attributes.allocated_resources.memory, node.attributes.memory, config.nodes_settings.unit)}\n` +
                    `Disk   : ${convertUnits(node.attributes.allocated_resources.disk, node.attributes.disk, config.nodes_settings.unit)}` +
                    (node.attributes?.allocated_resources?.cpu ? `\nCPU    : ${node.attributes?.allocated_resources?.cpu || 0}%` : "") +
                    (config.nodes_settings.servers ? `\nServers: ${node.attributes.relationships.servers}${config.nodes_settings.allocations_as_max_servers ? ` / ${node.attributes.relationships.allocations}` : ""}` : "") +
                    (config.nodes_settings.uptime ? `\nUptime : ${node.uptime ? uptimeFormatter(Date.now() - node.uptime) : "N/A"}` : "") +
                    "\n```";

                const statusText = node.maintenance
                    ? (config.status.maintenance || "🛠️ Maintenance")
                    : (node.status ? config.status.online : config.status.offline);

                nodesContainer.components.push({
                    type: 10, // TextDisplay
                    content: `### ${node.attributes.name} - ${statusText}\n${nodeValue}`
                });
            });
        } else {
            const listContent = nodes.map(node => {
                const statusText = node.maintenance
                    ? (config.status.maintenance || "🛠️ Maintenance")
                    : (node.status ? config.status.online : config.status.offline);
                return `**${node.attributes.name}** - ${statusText}`;
            }).join("\n");
            nodesContainer.components.push({
                type: 10, // TextDisplay
                content: listContent
            });
        }
    } else if ((!cache && !panel) || (!nodes || nodes.length < 1)) {
        const nodesContainer = {
            type: 17,
            accent_color: colorToInt(config.embed.nodes.color),
            components: [
                {
                    type: 10, // TextDisplay
                    content: "There are no nodes to be displayed!"
                }
            ]
        };
        finalComponents.push(nodesContainer);
    }
    // 2.5 Render Chart Container
    if (config.nodes_settings.chart && nodes && nodes.length > 0) {
        const labels = nodes.map(n => n.attributes.name);
        const allocatedData = nodes.map(n => Math.round(n.attributes.allocated_resources.memory / 102.4) / 10);
        const totalData = nodes.map(n => Math.round(n.attributes.memory / 102.4) / 10);

        const chartConfig = {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [
                    {
                        label: 'Allocated (GB)',
                        data: allocatedData,
                        backgroundColor: '#5865F2'
                    },
                    {
                        label: 'Total (GB)',
                        data: totalData,
                        backgroundColor: 'rgba(255, 255, 255, 0.1)'
                    }
                ]
            },
            options: {
                legend: {
                    labels: {
                        fontColor: '#dbdee1',
                        fontSize: 12
                    }
                },
                title: {
                    display: true,
                    text: 'Node Memory Allocation Overview',
                    fontColor: '#f2f3f5',
                    fontSize: 14
                },
                scales: {
                    yAxes: [{
                        ticks: {
                            fontColor: '#949ba4',
                            beginAtZero: true,
                            fontSize: 10
                        },
                        gridLines: {
                            color: '#3f4248'
                        }
                    }],
                    xAxes: [{
                        ticks: {
                            fontColor: '#949ba4',
                            fontSize: 10
                        },
                        gridLines: {
                            color: '#3f4248'
                        }
                    }]
                }
            }
        };

        const chartUrl = `https://quickchart.io/chart?bkg=%232b2d31&w=600&h=300&c=${encodeURIComponent(JSON.stringify(chartConfig))}`;

        const chartContainer = {
            type: 17, // Container
            accent_color: colorToInt(config.embed.nodes.color),
            components: [
                {
                    type: 12, // MediaGallery
                    items: [
                        {
                            media: {
                                url: chartUrl
                            },
                            description: "Memory Allocation Chart"
                        }
                    ]
                }
            ]
        };
        finalComponents.push(chartContainer);
    }

    // 3. Render Footer & Timestamp
    let footerText = "";
    if (config.embed.nodes.footer?.text) {
        footerText += `*${config.embed.nodes.footer.text}*`;
    }
    if (config.embed.nodes.timestamp) {
        footerText += (footerText ? " • " : "") + `<t:${Math.floor(Date.now() / 1000)}:R>`;
    }
    if (footerText) {
        const lastContainer = finalComponents[finalComponents.length - 1];
        if (lastContainer && lastContainer.type === 17 && lastContainer.components.length < 9) {
            lastContainer.components.push({
                type: 14 // Separator
            });
            lastContainer.components.push({
                type: 10, // TextDisplay
                content: footerText
            });
        }
    }

    // 3.5. Render Node Selection Dropdown
    if (config.detailed_metrics?.enable && nodes && nodes.length > 0) {
        const showFqdn = config.detailed_metrics?.show_fqdn !== false;
        const selectMenu = {
            type: 3, // StringSelectMenu
            custom_id: "select_node_details",
            placeholder: config.detailed_metrics?.placeholder || "Select a node for detailed stats...",
            options: nodes.slice(0, 25).map(node => {
                let statusLabel = node.status ? "Online" : "Offline";
                let emojiName = node.status ? "🟢" : "🔴";
                if (node.maintenance) {
                    statusLabel = "Maintenance";
                    emojiName = "🛠️";
                }
                return {
                    label: node.attributes.name,
                    value: node.attributes.id || node.attributes.name,
                    description: `${statusLabel}${showFqdn ? ` | ${node.attributes.fqdn}` : ""}`,
                    emoji: {
                        name: emojiName
                    }
                };
            })
        };

        const selectRow = {
            type: 1, // ActionRow
            components: [selectMenu]
        };

        let lastContainer = finalComponents[finalComponents.length - 1];
        if (!lastContainer || lastContainer.type !== 17 || lastContainer.components.length >= 10) {
            lastContainer = {
                type: 17, // Container
                accent_color: colorToInt(config.embed.nodes.color),
                components: []
            };
            finalComponents.push(lastContainer);
        }
        lastContainer.components.push(selectRow);
    }

    // 4. Render Row Buttons
    if (config.button.enable) {
        for (const row of ["row1", "row2", "row3", "row4", "row5"]) {
            const buttons = config.button[row]?.slice(0, 5).filter(button => button.label && button.url);

            if (buttons && buttons.length > 0) {
                const actionRow = {
                    type: 1, // ActionRow
                    components: buttons.map(button => {
                        const btn = {
                            type: 2, // Button
                            style: 5, // Link
                            label: button.label,
                            url: button.url
                        };
                        if (button.emoji) {
                            const customEmojiRegex = /^<?(a)?:?([^:]+):(\d+)>?$/;
                            const match = String(button.emoji).match(customEmojiRegex);
                            if (match) {
                                btn.emoji = {
                                    id: match[3],
                                    name: match[2],
                                    animated: Boolean(match[1])
                                };
                            } else {
                                btn.emoji = {
                                    name: button.emoji
                                };
                            }
                        }
                        return btn;
                    })
                };

                let lastContainer = finalComponents[finalComponents.length - 1];
                if (!lastContainer || lastContainer.type !== 17 || lastContainer.components.length >= 10) {
                    lastContainer = {
                        type: 17, // Container
                        accent_color: colorToInt(config.embed.nodes.color),
                        components: []
                    };
                    finalComponents.push(lastContainer);
                }
                lastContainer.components.push(actionRow);
            }
        }
    }

    try {
        const channel = await client.channels.fetch(process.env?.DiscordChannel);
        const messages = await channel.messages.fetch({ limit: 10 });
        const botMessage = messages.find(msg => msg.author.id === client.user.id);

        console.log(cliColor.cyanBright("[CalagopusStats] ") + cliColor.green(`Panel stats successfully posted to the ${cliColor.blueBright(channel.name)} channel!`));

        const nextDelay = delay ? delay * 1000 : config.refresh * 1000;
        setTimeout(() => client.getStats(client), nextDelay);

        if (config.message.content) {
            const firstContainer = finalComponents[0];
            if (firstContainer && firstContainer.type === 17) {
                firstContainer.components.unshift(
                    {
                        type: 10, // TextDisplay
                        content: config.message.content
                    },
                    {
                        type: 14 // Separator
                    }
                );
            }
        }

        const payload = {
            embeds: [],
            components: finalComponents.map(makeRaw),
            flags: 32768 // MessageFlags.IsComponentsV2
        };

        if (botMessage) {
            await botMessage.edit(payload);
        } else {
            await channel.send(payload);
        }
    } catch (error) {
        try {
            if (error.rawError?.code === 429) {
                console.error(cliColor.cyanBright("[CalagopusStats] ") + cliColor.redBright("Error 429 | Your IP has been rate limited by either Discord or your website. If it's a rate limit with Discord, you must wait. If it's a issue with your website, consider whitelisting your server IP."));
            } else if (error.rawError?.code === 403) {
                console.error(cliColor.cyanBright("[CalagopusStats] ") + cliColor.redBright("FORBIDDEN | The channel ID you provided is incorrect. Please double check you have the right ID. If you're not sure, read our documentation: \n>>https://github.com/heyitslumi/CalagopusStats#getting-channel-id<<"));
            } else if (error.code === "ENOTFOUND") {
                console.error(cliColor.cyanBright("[CalagopusStats] ") + cliColor.redBright("ENOTFOUND | DNS Error. Ensure your network connection and DNS server are functioning correctly."));
            } else if (error.rawError?.code === 50001) {
                console.error(cliColor.cyanBright("[CalagopusStats] ") + cliColor.redBright("Discord Error | Your discord bot doesn't have access to see/send message/edit message in the channel!"));
            } else if (error.rawError?.errors && Object?.values(error.rawError.errors)[0]?._errors[0]?.code === "MAX_EMBED_SIZE_EXCEEDED") {
                console.error(cliColor.cyanBright("[CalagopusStats] ") + cliColor.redBright("Discord Error | Embed message limit exceeded! Please limit or decrease the nodes that need to be shown in the config!"));
            } else if (error.rawError?.errors && Object?.values(error.rawError.errors)[0]?._errors[0]?.code) {
                console.error(Object.values(error.rawError.errors)[0]._errors[0].message);
            } else {
                console.error(cliColor.cyanBright("[CalagopusStats] ") + cliColor.redBright("Discord Error"), error);
            }
            errorLogging(error)
            process.exit();
        } catch (err) {
            console.error(error)
            process.exit();
        }
    }
}