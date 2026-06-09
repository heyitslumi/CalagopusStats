const axios = require("axios");
const errorLogging = require("./errorLogging.js");
const config = require("./configuration.js");

module.exports = async function getWingsStatus(node) {
    return axios(`${new URL(process.env?.PanelURL).origin}/api/admin/nodes/${node.attributes.id}/system/overview`, {
        method: "GET",
        headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${process.env?.PanelKEY}`
        },
        timeout: config.timeout * 1000,
        validateStatus: (status) => status >= 200 && status < 600 // Don't reject on HTTP errors like 500
    })
        .then((res) => {
            if (res.status === 429) {
                const error = new Error("Rate Limited");
                error.response = res;
                throw error;
            }
            if (res.status >= 200 && res.status < 300) {
                return { online: true, overview: res.data };
            }
            return { online: false };
        })
        .catch((error) => {
            // Propagate rate-limit (429) status to trigger the bot's cooldown
            if (error.response && error.response.status === 429) {
                throw error;
            }
            if (config.log_error) console.error(error.message || error);
            errorLogging(error, true);
            return { online: false };
        });
}