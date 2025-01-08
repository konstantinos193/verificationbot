require('dotenv').config();
const { Client, GatewayIntentBits } = require('discord.js');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildPresences
    ],
});

// Login with your bot token
client.login(process.env.DISCORD_TOKEN)
    .then(() => console.log('✅ Bot connected to Discord'))
    .catch(error => {
        console.error('Failed to connect to Discord:', error);
        process.exit(1);
    });

module.exports = client; 