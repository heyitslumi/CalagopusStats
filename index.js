const fs = require("node:fs");
const cliColor = require("cli-color");
const package = require("./package.json");
const axios = require("axios");
const errorLogging = require("./handlers/errorLogging.js");

process.stdout.write(cliColor.reset);
if (fs.existsSync("logs.txt")) {
    if (!fs.existsSync("./logs")) fs.mkdirSync("./logs")
    fs.renameSync("logs.txt", `logs/${Date.now()}.txt`);
}

console.log(
    `   ___ _      ___ ___  ___ _   _ ___ ___ _____  _  _____ ___ \n` +
    `  / __| |    / __/ _ \\| _ \\ | | / __/ __|_   _|/_\\|_   _/ __| \n` +
    ` | (__| |__ | (_| (_) |  _/ |_| \\__ \\__ \\ | | / _ \\ | | \\__ \\ \n` +
    `  \\___|____|\\___\\___/|_|  \\___/|___/___/ |_|/_/ \\_\\|_| |___/ \n` +
    `  ${cliColor.cyanBright.bold("CalagopusStats")} ${cliColor.yellowBright.bold(`v${package.version}`)}`
);

console.log(
    ` \nCopyright © ${new Date().getFullYear()} Lumi\n ` +
    ` \n${package.description}\n `
);

// Update check removed (fork — upstream version differs)

if (!fs.existsSync(".env") || !fs.existsSync(".setup-complete")) return require("./handlers/setup.js")();

process.on('uncaughtException', (error) => errorLogging(error))
process.on('unhandledRejection', (error) => errorLogging(error))

require("./handlers/application.js")();