const { EmbedBuilder } = require("discord.js");
const axios = require("axios");
const getNodesDetails = require("./getNodesDetails.js");
const getWingsStatus = require("./getWingsStatus.js");
const promiseTimeout = require("./promiseTimeout.js");
const errorLogging = require("./errorLogging.js");
const sendMessage = require("./sendMessage.js");
const getServers = require("./getServers.js");
const config = require("./configuration.js");
const getUsers = require("./getUsers.js");
const webhook = require("./webhook.js");
const cliColor = require("cli-color");
const path = require('node:path');
const fs = require("node:fs");

module.exports = async function getStats(client) {
    try {
        let cache = (() => {
            try {
                return JSON.parse(fs.readFileSync(path.join(__dirname, "../cache.json")))
            } catch {
                return false
            }
        })()

        console.log(cliColor.cyanBright("[CalagopusStats] ") + cliColor.yellow("Retrieving panel nodes..."))
        const nodesStats = await getNodesDetails();
        if (!nodesStats) throw new Error("Failed to get nodes attributes");

        let maintenanceList = [];
        try {
            maintenanceList = JSON.parse(fs.readFileSync(path.join(__dirname, "../maintenance.json"), "utf8"));
        } catch (err) {}

        const statusPromises = nodesStats.slice(0, config.nodes_settings.limit).map(async (node) => {
            const isMaintenance = maintenanceList.includes(node.attributes.id) || maintenanceList.includes(node.attributes.name);
            console.log(cliColor.cyanBright("[CalagopusStats] ") + cliColor.yellow(`Checking ${cliColor.blueBright(node.attributes.name)} status...`))
            // Cap status check timeout at 2 seconds so offline nodes do not delay the scan loop
            const statusTimeoutMs = Math.min(config.timeout * 1000, 2000);
            const nodeStatusResult = await promiseTimeout(getWingsStatus(node), statusTimeoutMs);
            const nodeStatus = nodeStatusResult?.online || false;
            const overview = nodeStatusResult?.overview;

            let nodeUptime = cache ? (() => {
                return cache.nodes.find((n) => n.attributes.id === node.attributes.id)?.uptime || Date.now()
            })() : Date.now()

            if (!nodeUptime && nodeStatus) nodeUptime = Date.now()

            if (!nodeStatus) {
                nodeUptime = false
                if (cache && cache.nodes.find((n) => n.attributes.id === node.attributes.id)?.status && !isMaintenance)
                    webhook(
                        new EmbedBuilder()
                            .setTitle("Node Offline")
                            .setColor("ED4245")
                            .setDescription(`Node \`${node.attributes.name}\` is currently offline`),
                        node.attributes.name
                    )
                console.log(cliColor.cyanBright("[CalagopusStats] ") + cliColor.redBright(`Node ${cliColor.blueBright(node.attributes.name)} is currently offline.`))
            } else {
                if (cache && !cache.nodes.find((n) => n.attributes.id === node.attributes.id)?.status && !isMaintenance)
                    webhook(
                        new EmbedBuilder()
                            .setTitle("Node Online")
                            .setColor("57F287")
                            .setDescription(`Node \`${node.attributes.name}\` is back online`),
                        node.attributes.name
                    )
            }

            let allocated_resources = { memory: 0, disk: 0, cpu: 0 };
            let relationships = { allocations: 0, servers: 0 };

            if (nodeStatus) {
                const parallelPromises = [];

                let statsFetched = false;
                let needCpuLimits = !config.nodes_settings.live_cpu;
                let needResourceLimits = !config.nodes_settings.live_resources;

                // 1. Stats query (if enabled)
                let statsPromise = Promise.resolve(null);
                if (config.nodes_settings.live_cpu || config.nodes_settings.live_resources) {
                    statsPromise = axios(`${new URL(process.env?.PanelURL).origin}/api/admin/nodes/${node.attributes.id}/system/stats`, {
                        method: "GET",
                        headers: {
                            "Content-Type": "application/json",
                            "Authorization": `Bearer ${process.env?.PanelKEY}`
                        },
                        timeout: config.timeout * 1000
                    }).then(res => {
                        statsFetched = true;
                        needCpuLimits = !config.nodes_settings.live_cpu;
                        needResourceLimits = !config.nodes_settings.live_resources;
                        return res.data;
                    }).catch(e => {
                        if (config.log_error) console.error("Failed to fetch node system stats:", e);
                        needCpuLimits = true;
                        needResourceLimits = true;
                        return null;
                    });
                }
                parallelPromises.push(statsPromise);

                // 2. Allocations query
                const allocationsPromise = axios(`${new URL(process.env?.PanelURL).origin}/api/admin/nodes/${node.attributes.id}/allocations?page=1&per_page=1`, {
                    method: "GET",
                    headers: {
                        "Content-Type": "application/json",
                        "Authorization": `Bearer ${process.env?.PanelKEY}`
                    },
                    timeout: config.timeout * 1000
                }).then(res => {
                    if (res.data && res.data.allocations) {
                        relationships.allocations = res.data.allocations.total || 0;
                    }
                }).catch(e => {
                    if (config.log_error) console.error("Failed to fetch node allocations:", e);
                });
                parallelPromises.push(allocationsPromise);

                // Wait for stats and allocations in parallel
                const [statsData] = await Promise.all(parallelPromises);

                // Process stats data if resolved
                if (statsData && statsData.stats) {
                    const stats = statsData.stats;
                    if (config.nodes_settings.live_cpu && stats.cpu) {
                        allocated_resources.cpu = (Math.round(stats.cpu.used * 10) / 10).toFixed(1);
                    }
                    if (config.nodes_settings.live_resources && stats.memory) {
                        allocated_resources.memory = Math.round(stats.memory.used / (1024 * 1024));
                        node.attributes.memory = Math.round(stats.memory.total / (1024 * 1024));
                    }
                    if (config.nodes_settings.live_resources && stats.disk) {
                        allocated_resources.disk = Math.round(stats.disk.used / (1024 * 1024));
                        node.attributes.disk = Math.round(stats.disk.total / (1024 * 1024));
                    }
                }

                // 3. Page loop servers limit sum (if limits required)
                if (needCpuLimits || needResourceLimits) {
                    let page = 1;
                    let hasMore = true;
                    while (hasMore) {
                        try {
                            const serversRes = await axios(`${new URL(process.env?.PanelURL).origin}/api/admin/nodes/${node.attributes.id}/servers?page=${page}&per_page=100`, {
                                method: "GET",
                                headers: {
                                    "Content-Type": "application/json",
                                    "Authorization": `Bearer ${process.env?.PanelKEY}`
                                },
                                timeout: config.timeout * 1000
                            });
                            if (serversRes.data && serversRes.data.servers && serversRes.data.servers.data) {
                                const serversList = serversRes.data.servers.data;
                                for (const s of serversList) {
                                    if (needResourceLimits) {
                                        allocated_resources.memory += s.limits.memory || 0;
                                        allocated_resources.disk += s.limits.disk || 0;
                                    }
                                    if (needCpuLimits) {
                                        allocated_resources.cpu += s.limits.cpu || 0;
                                    }
                                }
                                if (serversList.length < 100) {
                                    hasMore = false;
                                } else {
                                    page++;
                                }
                            } else {
                                hasMore = false;
                            }
                        } catch (e) {
                            hasMore = false;
                            if (config.log_error) console.error("Failed to fetch node servers:", e);
                        }
                    }
                }

                if (overview && overview.servers) {
                    relationships.servers = overview.servers.total || 0;
                }
            }

            return {
                attributes: {
                    id: node.attributes.id,
                    name: node.attributes.name,
                    memory: node.attributes.memory,
                    disk: node.attributes.disk,
                    cpu: node.attributes.cpu,
                    fqdn: node.attributes.fqdn,
                    allocated_resources: allocated_resources,
                    relationships: relationships
                },
                uptime: nodeUptime,
                status: nodeStatus,
                maintenance: isMaintenance
            };
        });

        let panelOverview = null;
        if (config.panel_settings.hardware_details) {
            try {
                const overviewRes = await axios(`${new URL(process.env?.PanelURL).origin}/api/admin/system/overview`, {
                    method: "GET",
                    headers: {
                        "Content-Type": "application/json",
                        "Authorization": `Bearer ${process.env?.PanelKEY}`
                    },
                    timeout: config.timeout * 1000
                });
                if (overviewRes.data) {
                    panelOverview = overviewRes.data;
                }
            } catch (e) {
                if (config.log_error) console.error("Failed to fetch panel system overview:", e);
            }
        }

        const data = {
            uptime: cache ? (() => {
                return cache.uptime || Date.now()
            })() : Date.now(),
            servers: await getServers(),
            users: await getUsers(),
            nodes: await Promise.all(statusPromises),
            panelOverview: panelOverview,
            isPanelDown: !cache.uptime,
            timestamp: Date.now()
        }

        fs.writeFileSync("cache.json", JSON.stringify(data, null, 2), "utf8");

        if (data.isPanelDown) webhook(
            new EmbedBuilder()
                .setTitle("Panel Online")
                .setColor("57F287")
                .setDescription(`Panel is back online`)
        )

        data.client = client
        data.panel = true

        return sendMessage(data);
    } catch (error) {
        if (config.log_error) console.error(error)
        errorLogging(error)
        
        const isRateLimited = error.response && error.response.status === 429;
        if (isRateLimited) {
            console.log(cliColor.cyanBright("[CalagopusStats] ") + cliColor.redBright("Calagopus Panel API Rate Limit (429) hit! Pausing stats checks for 60 seconds..."));
        } else {
            console.log(cliColor.cyanBright("[CalagopusStats] ") + cliColor.redBright("Panel is currently offline."));
        }

        return fs.readFile(path.join(__dirname, "../cache.json"), (err, data) => {
            if (err) {
                sendMessage({ client, cache: false, panel: false, rateLimited: isRateLimited, delay: isRateLimited ? 60 : undefined });
                return console.log(cliColor.cyanBright("[CalagopusStats] ") + cliColor.redBright("Last cache was not found!"));
            }

            try {
                const results = JSON.parse(data);
                if (results.uptime && !isRateLimited) webhook(
                    new EmbedBuilder()
                        .setTitle("Panel Offline")
                        .setColor("ED4245")
                        .setDescription(`Panel is currently offline`)
                );
                
                if (!isRateLimited) {
                    results.uptime = false;
                }
                
                fs.writeFileSync("cache.json", JSON.stringify(results, null, 2), "utf8");

                results.client = client
                results.panel = false
                results.cache = true
                results.rateLimited = isRateLimited
                results.delay = isRateLimited ? 60 : undefined
                return sendMessage(results);
            } catch {
                console.log(cliColor.cyanBright("[CalagopusStats] ") + cliColor.redBright("Something went wrong with cache data..."));

                return sendMessage({ client, cache: false, panel: false, rateLimited: isRateLimited, delay: isRateLimited ? 60 : undefined });
            }
        });
    }
}