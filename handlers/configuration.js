const cliColor = require("cli-color");
const yaml = require("js-yaml");
const fs = require("node:fs");
const logger = require("./logger.js");

logger.system("Loading configuration...");

let config = yaml.load(fs.readFileSync("./config.yml", "utf8"));
if (fs.existsSync("config-dev.yml")) {
    logger.system("Using development configuration...");
    config = yaml.load(fs.readFileSync("./config-dev.yml", "utf8"));
}

try {
    const testURL = new URL(process.env?.PanelURL);
    if (!testURL.protocol.startsWith("http")) throw new Error();
} catch {
    logger.error('Config Error | Invalid URL Format! Example Correct URL: "https://panel.example.com"');
    process.exit();
}

if (config.version !== 1) {
    logger.error('Config Error | Invalid config version! The config has been updated. Please get the new config format from: \n>> https://github.com/heyitslumi/CalagopusStats/blob/main/config.yml <<');
    process.exit();
}

if (config.timezone) {
    process.env.TZ = config.timezone;
}

logger.success("Configuration loaded");

module.exports = config;