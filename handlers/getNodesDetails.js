const config = require("./configuration.js");
const cliColor = require("cli-color");
const axios = require("axios");

module.exports = async function getAllNodes() {
    const parseUrl = (u) => {
        try {
            return new URL(u);
        } catch {
            return { hostname: u, protocol: 'http:', port: '80' };
        }
    };

    return axios(`${new URL(process.env?.PanelURL).origin}/api/admin/nodes?page=1&per_page=100`, {
        method: "GET",
        headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${process.env?.PanelKEY}`
        },
        timeout: config.timeout * 1000
    })
        .then((res) => {
            const nodes = res.data && res.data.nodes && res.data.nodes.data ? res.data.nodes.data : [];
            return nodes.map(node => {
                const urlObj = parseUrl(node.public_url || node.url);
                return {
                    attributes: {
                        id: node.uuid,
                        name: node.name,
                        memory: node.memory,
                        disk: node.disk,
                        cpu: 100,
                        fqdn: urlObj.hostname,
                        scheme: urlObj.protocol.replace(':', ''),
                        daemon_listen: urlObj.port || (urlObj.protocol === 'https:' ? '443' : '80')
                    }
                };
            }).filter((node) => !config.nodes_settings.blacklist.includes(node.attributes.id));
        })
        .catch((error) => {
            if (error.code === "ENOTFOUND") {
                console.log(cliColor.cyanBright("[CalagopusStats] ") + cliColor.redBright("ENOTFOUND | DNS Error. Ensure your network connection and DNS server are functioning correctly."));
            } else if (error.code === "ECONNREFUSED") {
                console.log(cliColor.cyanBright("[CalagopusStats] ") + cliColor.redBright("ECONNREFUSED | Connection refused. Ensure the panel is running and reachable."));
            } else if (error.code === "ETIMEDOUT") {
                console.log(cliColor.cyanBright("[CalagopusStats] ") + cliColor.redBright("ETIMEDOUT | Connection timed out. The panel took too long to respond."));
            } else if (error.code === "ECONNRESET") {
                console.log(cliColor.cyanBright("[CalagopusStats] ") + cliColor.redBright("ECONNRESET | Connection reset by peer. The panel closed the connection unexpectedly."));
            } else if (error.code === "EHOSTUNREACH") {
                console.log(cliColor.cyanBright("[CalagopusStats] ") + cliColor.redBright("EHOSTUNREACH | Host unreachable. The panel is down or not reachable."));
            } else if (error.response) {
                if (error.response.status === 401) {
                    console.log(cliColor.cyanBright("[CalagopusStats] ") + cliColor.redBright("401 | Unauthorized. Invalid Application Key or API Key doesn't have permission to perform this action."));
                } else if (error.response.status === 403) {
                    console.log(cliColor.cyanBright("[CalagopusStats] ") + cliColor.redBright("403 | Forbidden. Invalid Application Key or API Key doesn't have permission to perform this action."));
                } else if (error.response.status === 404) {
                    console.log(cliColor.cyanBright("[CalagopusStats] ") + cliColor.redBright("404 | Not Found. Invalid Panel URL or the Panel doesn't exist."));
                } else if (error.response.status === 429) {
                    console.log(cliColor.cyanBright("[CalagopusStats] ") + cliColor.redBright("429 | Too Many Requests. You have sent too many requests in a given amount of time."));
                } else if ([500, 502, 503, 504].includes(error.response.status)) {
                    console.log(cliColor.cyanBright("[CalagopusStats] ") + cliColor.redBright("500 | Internal Server Error. This is an error with your panel, CalagopusStats is not the cause."));
                } else {
                    console.log(cliColor.cyanBright("[CalagopusStats] ") + cliColor.redBright(`${error.response.status} | Unexpected error: ${error.response.statusText}`));
                }
            } else {
                console.log(cliColor.cyanBright("[CalagopusStats] ") + cliColor.redBright(`Unexpected error: ${error.message}`));
            }
            throw error;
        })
}