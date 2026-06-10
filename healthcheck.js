const fs = require("node:fs");
const path = require("node:path");

const healthPath = path.join(__dirname, "health.json");

// Read configuration refresh rate to determine max allowed delay
let maxDelayMs = 90000; // 90 seconds default fallback
try {
    const yaml = require("js-yaml");
    const config = yaml.load(fs.readFileSync(path.join(__dirname, "config.yml"), "utf8"));
    const refresh = config.refresh || 30;
    // Allow 2x refresh interval + 30s grace period for latency
    maxDelayMs = (refresh * 2000) + 30000;
} catch (e) {
    // Ignore error and use default fallback
}

try {
    if (!fs.existsSync(healthPath)) {
        console.error("Health check failed: health.json not found.");
        process.exit(1);
    }
    const data = JSON.parse(fs.readFileSync(healthPath, "utf8"));
    const diff = Date.now() - data.last_heartbeat;
    if (diff > maxDelayMs) {
        console.error(`Health check failed: Last heartbeat was ${Math.round(diff / 1000)}s ago.`);
        process.exit(1);
    }
    console.log("Healthy");
    process.exit(0);
} catch (error) {
    console.error("Health check failed with error:", error.message);
    process.exit(1);
}
