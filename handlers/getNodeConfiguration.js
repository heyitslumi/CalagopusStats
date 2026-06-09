const config = require("./configuration.js");

module.exports = async function getNodeConfiguration(id) {
    return fetch(`${new URL(process.env?.PanelURL).origin}/api/admin/nodes/${id}/config`, {
        method: "GET",
        headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${process.env?.PanelKEY}`
        },
    })
        .then((res) => res.json())
        .then((data) => data.config)
}