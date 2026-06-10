const cliColor = require("cli-color");
const config = require("./configuration.js");
const axios = require("axios");
const logger = require("./logger.js");

module.exports = async function getUsers() {
    logger.system("Retrieving panel users...");
    return axios(`${new URL(process.env?.PanelURL).origin}/api/admin/users?page=1&per_page=1`, {
        method: "GET",
        headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${process.env?.PanelKEY}`
        },
        timeout: config.timeout * 1000
    })
        .then((res) => res.data.users ? res.data.users.total : 0);
}