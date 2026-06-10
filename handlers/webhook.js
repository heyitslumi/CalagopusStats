const axios = require("axios")
const config = require("./configuration")
const cliColor = require("cli-color")
const logger = require("./logger.js")

const colorToInt = (hex) => {
    if (!hex) return 5793010; // default discord blurple
    if (typeof hex === 'number') return hex;
    hex = String(hex).replace('#', '');
    const num = parseInt(hex, 16);
    return isNaN(num) ? 5793010 : num;
};

const getAccessory = (url) => {
    if (!url) return null;
    return {
        type: 11, // Thumbnail (v2)
        media: { url }
    };
};

const makeRaw = (obj) => {
    if (!obj || typeof obj !== 'object') return obj;
    return {
        ...obj,
        toJSON() {
            const copy = { ...this };
            delete copy.toJSON;
            return copy;
        }
    };
};

module.exports = async function webhook(embed, nodeName) {
    if (config.notifier.enable && config.notifier.webhook) {
        try {
            // Append ?with_components=true to Webhook URL if not present
            let webhookUrl = config.notifier.webhook;
            try {
                const urlObj = new URL(webhookUrl);
                urlObj.searchParams.set("with_components", "true");
                webhookUrl = urlObj.toString();
            } catch (err) {
                if (!webhookUrl.includes("with_components=true")) {
                    webhookUrl += webhookUrl.includes("?") ? "&with_components=true" : "?with_components=true";
                }
            }

            // Build Components V2 Container
            const container = {
                type: 17, // Container
                accent_color: colorToInt(embed.data.color),
                components: []
            };

            const title = embed.data.title || "Alert";
            let emoji = "";
            if (title.toLowerCase().includes("offline")) {
                emoji = "🚨 ";
            } else if (title.toLowerCase().includes("online")) {
                emoji = "✅ ";
            }
            
            let headerContent = `## ${emoji}${title}`;

            const thumbnail = getAccessory(config.notifier.embed.thumbnail);
            if (thumbnail) {
                container.components.push({
                    type: 9, // Section
                    components: [
                        {
                            type: 10, // TextDisplay
                            content: headerContent
                        }
                    ],
                    accessory: thumbnail
                });
            } else {
                container.components.push({
                    type: 10, // TextDisplay
                    content: headerContent
                });
            }

            if (embed.data.description) {
                container.components.push({
                    type: 10, // TextDisplay
                    content: `> ${embed.data.description}`
                });
            }

            // Footer
            let footerText = "";
            if (config.notifier.embed.footer?.text) {
                footerText += `*${config.notifier.embed.footer.text}*`;
            }
            if (config.notifier.embed.timestamp) {
                footerText += (footerText ? " • " : "") + `<t:${Math.floor(Date.now() / 1000)}:R>`;
            }

            if (footerText) {
                container.components.push({
                    type: 14 // Separator
                });
                container.components.push({
                    type: 10, // TextDisplay
                    content: footerText
                });
            }

            // Post direct to Webhook
            const payload = {
                components: [makeRaw(container)],
                flags: 32768 // MessageFlags.IsComponentsV2
            };

            let webhookUsername = config.notifier.username || "CalagopusStats Notifier";
            if (nodeName) {
                webhookUsername = `${webhookUsername} - ${nodeName}`;
            }
            payload.username = webhookUsername;

            if (config.notifier.avatar_url) {
                payload.avatar_url = config.notifier.avatar_url;
            }

            await axios.post(webhookUrl, payload, {
                headers: {
                    "Content-Type": "application/json"
                }
            });
        } catch (error) {
            if (config.log_error) console.error(error);
            logger.error("Failed to send webhook notification. Check webhook URL or logs.");
        }
    }
}