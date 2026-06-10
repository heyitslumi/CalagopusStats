const fs = require("node:fs");
const cliColor = require("cli-color");
const yaml = require("js-yaml");
const package = require("../package.json");
const logger = require("./logger.js");

module.exports = function ErrorLogging(error, isNotError) {
    if (!isNotError) logger.error("Something went wrong.");

    if (!fs.existsSync("logs.txt")) {
        const config = yaml.load(fs.readFileSync("./config.yml", "utf8"));
        config.notifier.webhook = "REDACTED"

        fs.appendFileSync("logs.txt", "PACKAGE:\n\n" + yaml.dump(package) + "\n\n\n")
        fs.appendFileSync("logs.txt", "CONFIGURATION:\n\n" + yaml.dump(config) + "\n\n\nERROR LOGS:\n\n")
    }
    fs.appendFileSync("logs.txt", `${new Date().toISOString()} | ${!isNotError ? "ERROR" : "WINGS"} | ${error?.stack || error}\n`)
}