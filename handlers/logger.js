const cliColor = require("cli-color");

function formatTime() {
    const now = new Date();
    return cliColor.blackBright(
        `[${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}]`
    );
}

const prefix = cliColor.cyanBright("CalagopusStats");

module.exports = {
    info: (msg) => console.log(`${formatTime()} ${cliColor.blackBright("│")} ${prefix} ${cliColor.blue("ℹ")} ${cliColor.white(msg)}`),
    success: (msg) => console.log(`${formatTime()} ${cliColor.blackBright("│")} ${prefix} ${cliColor.green("✔")} ${cliColor.greenBright(msg)}`),
    warn: (msg) => console.log(`${formatTime()} ${cliColor.blackBright("│")} ${prefix} ${cliColor.yellowBright("⚠")} ${cliColor.yellowBright(msg)}`),
    error: (msg) => console.log(`${formatTime()} ${cliColor.blackBright("│")} ${prefix} ${cliColor.red("✖")} ${cliColor.redBright(msg)}`),
    system: (msg) => console.log(`${formatTime()} ${cliColor.blackBright("│")} ${prefix} ${cliColor.cyan("⚡")} ${cliColor.cyanBright(msg)}`)
};
