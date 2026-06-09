const config = require("./configuration.js");
const cliColor = require("cli-color");
const axios = require("axios");

module.exports = async function getServers() {
    console.log(cliColor.cyanBright("[CalagopusStats] ") + cliColor.yellow("Retrieving panel servers..."));
    return axios(`${new URL(process.env?.PanelURL).origin}/api/admin/servers?page=1&per_page=1`, {
        method: "GET",
        headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${process.env?.PanelKEY}`
        },
        timeout: config.timeout * 1000
    })
        .then((res) => res.data.servers ? res.data.servers.total : 0);
}