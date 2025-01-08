require('dotenv').config();
const { EmbedBuilder } = require('discord.js');
const axios = require('axios');
const client = require('./discord-client');
const { createSolanaAnalyzer } = require('./systems/chains/SolanaAnalyzer');
const createTokenCallTracker = require('./systems/TokenCallTracker');
const { createSolanaNFTCallTracker } = require('./systems/NFTCallTracker');
const { createEthNFTCallTracker } = require('./systems/EthNFTCallTracker');
const { createApeNFTCallTracker } = require('./systems/ApeNFTCallTracker');
const { createRuneCallTracker } = require('./systems/RuneCallTracker');
const { createOrdinalCallTracker } = require('./systems/OrdinalCallTracker');
const { createMarketAnalyzer } = require('./systems/MarketAnalyzer');
const { createMarketSentinel } = require('./systems/MarketSentinel');
const { createLeaderboardManager } = require('./systems/LeaderboardManager');
const { createInfoManager } = require('./systems/InfoManager');

// Initialize TokenCallTracker with client
const TokenCallTracker = createTokenCallTracker(client);
client.tokenCallTracker = TokenCallTracker;

// Initialize NFT trackers
client.solanaNFTCallTracker = createSolanaNFTCallTracker(client);
client.ethNFTCallTracker = createEthNFTCallTracker(client);
client.apeNFTCallTracker = createApeNFTCallTracker(client);
client.runeCallTracker = createRuneCallTracker(client);
client.ordinalCallTracker = createOrdinalCallTracker(client);

// Initialize market analysis systems
client.solanaAnalyzer = createSolanaAnalyzer(client);
client.marketAnalyzer = createMarketAnalyzer(client);
client.marketSentinel = createMarketSentinel(client);

// Initialize leaderboard manager
client.leaderboardManager = createLeaderboardManager(client);

// Initialize info manager
client.infoManager = createInfoManager(client);

// Constants
const VERIFICATION_CHANNEL_ID = '1322571021403951104';
const RULES_CHANNEL_ID = '1311066199114645504';
const CHECK_INTERVAL = 1000 * 60 * 60; // 1 hour in milliseconds
const VERIFICATION_BASE_URL = 'https://deape.fi';
const API_BASE_URL = process.env.API_URL || 'https://apeelitclubbotapi.onrender.com';
const BOT_API_KEY = process.env.BOT_API_KEY;
const VERIFIED_ROLE_ID = process.env.VERIFIED_ROLE_ID;
const ELITE_ROLE_ID = process.env.ELITE_ROLE_ID;
const GUILD_ID = process.env.GUILD_ID;

// Setup API client
const apiClient = axios.create({
    baseURL: API_BASE_URL,
    headers: {
        'x-api-key': BOT_API_KEY
    }
});

// Debug log for API configuration
console.log('API Configuration:', {
    url: API_BASE_URL,
    verificationUrl: VERIFICATION_BASE_URL,
    hasApiKey: !!BOT_API_KEY
});

// Function to update user roles
async function updateUserRoles(userId, totalNFTs) {
    try {
        console.log('Processing role update:', { userId, totalNFTs });

        const guild = await client.guilds.fetch(GUILD_ID);
        if (!guild) {
            console.error('Guild not found:', GUILD_ID);
            return;
        }

        const member = await guild.members.fetch(userId);
        if (!member) {
            console.error('Member not found:', userId);
            return;
        }

        // Remove existing roles first
        const rolesToRemove = [VERIFIED_ROLE_ID, ELITE_ROLE_ID];
        await Promise.all(rolesToRemove.map(roleId => member.roles.remove(roleId).catch(err => {
            console.error(`Failed to remove role ${roleId}:`, err);
        })));

        // Add roles based on NFT count
        if (totalNFTs >= 1) {
            await member.roles.add(VERIFIED_ROLE_ID);
            console.log(`Added verified role to ${member.user.tag}`);
        }
        
        if (totalNFTs >= 10) {
            await member.roles.add(ELITE_ROLE_ID);
            console.log(`Added elite role to ${member.user.tag}`);
        }

        // Log the successful role update
        console.log(`Updated roles for ${member.user.tag}:`, {
            totalNFTs,
            verified: totalNFTs >= 1,
            elite: totalNFTs >= 10
        });

    } catch (error) {
        console.error('Role update error:', error);
    }
}

// Function to check and update roles
async function checkAndUpdateRoles() {
    try {
        const guild = await client.guilds.fetch(GUILD_ID);
        if (!guild) {
            console.error('Guild not found:', GUILD_ID);
            return;
        }

        const members = await guild.members.fetch();
        for (const member of members.values()) {
            const userId = member.id;
            const currentNFTs = await fetchCurrentNFTs(userId); // Implement this function

            // Check current roles
            const hasVerifiedRole = member.roles.cache.has(VERIFIED_ROLE_ID);
            const hasEliteRole = member.roles.cache.has(ELITE_ROLE_ID);

            // Update roles based on current NFT count
            if (currentNFTs >= 1 && !hasVerifiedRole) {
                await member.roles.add(VERIFIED_ROLE_ID);
                console.log(`Added verified role to ${member.user.tag}`);
            } else if (currentNFTs < 1 && hasVerifiedRole) {
                await member.roles.remove(VERIFIED_ROLE_ID);
                console.log(`Removed verified role from ${member.user.tag}`);
            }

            if (currentNFTs >= 10 && !hasEliteRole) {
                await member.roles.add(ELITE_ROLE_ID);
                console.log(`Added elite role to ${member.user.tag}`);
            } else if (currentNFTs < 10 && hasEliteRole) {
                await member.roles.remove(ELITE_ROLE_ID);
                console.log(`Removed elite role from ${member.user.tag}`);
            }
        }
    } catch (error) {
        console.error('Error checking and updating roles:', error);
    }
}

// Periodically check and update roles
setInterval(checkAndUpdateRoles, 3600000); // Check every hour

// Handle NFT call commands
client.on('messageCreate', async (message) => {
    if (message.author.bot) return;

    // Token calls
    if (message.content.startsWith('/call')) {
        const args = message.content.split(' ');
        if (args.length < 3) {
            message.reply('Please provide a token address and chain. Usage: /call <address> <chain>');
            return;
        }
        try {
            await client.tokenCallTracker.createCall(message.channel.id, message.author.id, args[1], args[2]);
        } catch (error) {
            message.reply(`❌ Error creating token call: ${error.message}`);
        }
    }

    // Solana NFT calls
    if (message.content.startsWith('/nftcall')) {
        const args = message.content.split(' ');
        if (args.length < 2) {
            message.reply('Please provide a collection symbol. Usage: /nftcall <symbol>');
            return;
        }
        try {
            await client.solanaNFTCallTracker.createCall(message.channel.id, message.author.id, args[1]);
        } catch (error) {
            message.reply(`❌ Error creating NFT call: ${error.message}`);
        }
    }

    // ETH NFT calls
    if (message.content.startsWith('/ethnftcall')) {
        const args = message.content.split(' ');
        if (args.length < 2) {
            message.reply('Please provide a collection address. Usage: /ethnftcall <address>');
            return;
        }
        try {
            await client.ethNFTCallTracker.createCall(message.channel.id, message.author.id, args[1]);
        } catch (error) {
            message.reply(`❌ Error creating ETH NFT call: ${error.message}`);
        }
    }

    // APE NFT calls
    if (message.content.startsWith('/apenftcall')) {
        const args = message.content.split(' ');
        if (args.length < 2) {
            message.reply('Please provide a collection address. Usage: /apenftcall <address>');
            return;
        }
        try {
            await client.apeNFTCallTracker.createCall(message.channel.id, message.author.id, args[1]);
        } catch (error) {
            message.reply(`❌ Error creating APE NFT call: ${error.message}`);
        }
    }

    // Rune calls
    if (message.content.startsWith('/runecall')) {
        const args = message.content.split(' ');
        if (args.length < 2) {
            message.reply('Please provide a rune symbol. Usage: /runecall <symbol>');
            return;
        }
        try {
            await client.runeCallTracker.createCall(message.channel.id, message.author.id, args[1]);
        } catch (error) {
            message.reply(`❌ Error creating rune call: ${error.message}`);
        }
    }

    // Ordinal calls
    if (message.content.startsWith('/ordinalcall')) {
        const args = message.content.split(' ');
        if (args.length < 2) {
            message.reply('Please provide a collection symbol. Usage: /ordinalcall <symbol>');
            return;
        }
        try {
            await client.ordinalCallTracker.createCall(message.channel.id, message.author.id, args[1]);
        } catch (error) {
            message.reply(`❌ Error creating ordinal call: ${error.message}`);
        }
    }
});

// Ready event handler
client.once('ready', async () => {
    try {
        console.log('✅ Bot connected to Discord');
        console.log(`🦍 Ape Elite Club Bot is online as ${client.user.tag}!`);

        // Post rules
        const rulesChannel = await client.channels.fetch(RULES_CHANNEL_ID);
        if (!rulesChannel) {
            throw new Error('Rules channel not found');
        }

        const rulesMessages = await rulesChannel.messages.fetch();
        await rulesChannel.bulkDelete(rulesMessages);
        
        const rulesEmbed = new EmbedBuilder()
            .setTitle('APE RULES')
            .setColor('#0154fa')
            .setDescription('• Stay Strong, Stay United: Harassment of any kind, including witch-hunting, sexism, racism, and hate speech, will not be tolerated in our community. Avoid drama and unnecessary arguments—treat your fellow apes like you\'d want to be treated!\n\n' + 
                '• No Spamming or Advertising: Don\'t flood our community with promotions for other servers or projects. Unauthorized buying/selling through secondary markets is forbidden here. Sending the same message across multiple channels could lead to a permanent ban.\n\n' +
                '• Keep it Clean (No NSFW): This is a professional community. No adult or NSFW content is allowed in this server. Let\'s keep the vibes appropriate for all members!\n\n' +
                '• Report Issues: If you witness any behavior that\'s disrupting our community\'s harmony, report it to the staff immediately. Together, we keep this space safe and productive for everyone.\n\n' +
                '• Follow Discord Guidelines: Make sure to adhere to Discord\'s Community Guidelines, which can be found here: [Community Guidelines](https://discord.com/guidelines)')
            .setImage('https://i.imgur.com/o6TKcwQ.jpeg')
            .setFooter({ 
                text: 'Ape Elite Club • Community Guidelines',
                iconURL: 'https://i.imgur.com/QABnvka.jpeg'
            });

        await rulesChannel.send({ embeds: [rulesEmbed] });

        // Set up verification channel
        const verificationChannel = await client.channels.fetch(VERIFICATION_CHANNEL_ID);
        if (!verificationChannel) {
            console.error('Verification channel not found');
            return;
        }

        // Clear existing messages in verification channel
        const messages = await verificationChannel.messages.fetch();
        await verificationChannel.bulkDelete(messages);

        const verifyEmbed = new EmbedBuilder()
            .setTitle('Ape Elite Club Verification')
            .setColor('#0154fa')
            .setThumbnail('https://i.imgur.com/QABnvka.jpeg')
            .setDescription('🔒 Verification Required\nTo access this exclusive community, you need to verify your Ape Elite Club NFT ownership.\n\n' +
                '✅ How It Works\nSimply connect your wallet to verify your holdings and gain access to all channels.\n\n' +
                '👆 Get Started\nClick here to begin the verification process.\nAlready verified? You\'re all set!\n\n' +
                '🛡️ Security Note\nWallet connection is read-only and only used to verify your NFT holdings. Your assets are always safe.')
            .setFooter({ 
                text: 'Ape Elite Club • Verification System',
                iconURL: 'https://i.imgur.com/QABnvka.jpeg'
            });

        await verificationChannel.send({
            embeds: [verifyEmbed],
            components: [{
                type: 1,
                components: [
                    {
                        type: 2,
                        style: 1,
                        label: '🔍 Verify Status',
                        custom_id: 'check_status'
                    },
                    {
                        type: 2,
                        style: 3,
                        label: '👛 Connect Wallet',
                        custom_id: 'manage_wallets'
                    },
                    {
                        type: 2,
                        style: 4,
                        label: '🏷️ View Roles',
                        custom_id: 'server_roles'
                    }
                ]
            }]
        });

        // Start market analysis
        console.log('Starting market analysis system...');
        await client.marketAnalyzer.startAnalysis();
        console.log('Performing market analysis...');

        // Start market sentiment monitoring
        console.log('Starting market sentiment monitoring...');
        await client.marketSentinel.startMonitoring();
        console.log('Analyzing market sentiment...');

        // Start leaderboard system
        console.log('Starting leaderboard system...');
        await client.leaderboardManager.startUpdates();
        console.log('Updating leaderboards...');

        // Start Solana analysis
        await client.solanaAnalyzer.startAnalysis();

        // Listen for role update events from the API
        setInterval(async () => {
            try {
                const response = await apiClient.get('/api/pending-role-updates');
                if (response.data && Array.isArray(response.data)) {
                    for (const update of response.data) {
                        await updateUserRoles(update.userId, update.totalNFTs);
                    }
                }
            } catch (error) {
                console.error('Error checking for role updates:', error);
            }
        }, 30000); // Check every 30 seconds

    } catch (error) {
        console.error('Error in ready event:', error);
    }
});

// Error handling
process.on('unhandledRejection', (error) => {
    console.error('Unhandled promise rejection:', error);
});

process.on('uncaughtException', (error) => {
    console.error('Uncaught exception:', error);
});

// Handle button interactions
client.on('interactionCreate', async (interaction) => {
    if (!interaction.isButton()) return;

    try {
        switch (interaction.customId) {
            case 'check_status':
                await handleCheckStatus(interaction);
                break;
            case 'manage_wallets':
                await handleManageWallets(interaction);
                break;
            case 'server_roles':
                await handleServerRoles(interaction);
                break;
            default:
                await interaction.reply({ content: 'Unknown button interaction', ephemeral: true });
        }
    } catch (error) {
        console.error('Error handling button interaction:', error);
        await interaction.reply({ 
            content: 'There was an error processing your request. Please try again later.',
            ephemeral: true 
        });
    }
});

// Button handlers
async function handleCheckStatus(interaction) {
    try {
        const member = interaction.member;
        const hasVerifiedRole = member.roles.cache.has(process.env.VERIFIED_ROLE_ID);
        const hasEliteRole = member.roles.cache.has(process.env.ELITE_ROLE_ID);

        const embed = new EmbedBuilder()
            .setTitle('Verification Status')
            .setColor(hasVerifiedRole ? '#00ff00' : '#ff0000')
            .setDescription(
                `**User:** ${member.user.tag}\n` +
                `**<@&1322623738168213575>:** ${hasVerifiedRole ? '✅' : '❌'}\n` +
                `**<@&1322624148857557084>:** ${hasEliteRole ? '✅' : '❌'}\n\n` +
                `${!hasVerifiedRole ? 'Click "Connect Wallet" to verify your NFT holdings.' : ''}`
            );

        await interaction.reply({ embeds: [embed], ephemeral: true });
    } catch (error) {
        console.error('Error checking status:', error);
        await interaction.reply({ 
            content: 'Failed to check verification status. Please try again.',
            ephemeral: true 
        });
    }
}

async function handleManageWallets(interaction) {
    try {
        // Create unique session ID
        const sessionId = Math.random().toString(36).substring(2, 12);
        
        // Generate verification URL with the correct format
        const verifyUrl = `${VERIFICATION_BASE_URL}/discord/connect?sessionId=${sessionId}&username=${encodeURIComponent(interaction.user.tag)}&discordId=${interaction.user.id}`;

        const embed = new EmbedBuilder()
            .setTitle('Wallet Verification')
            .setColor('#0154fa')
            .setDescription(
                'Click the button below to connect your wallet and verify your NFT holdings.\n\n' +
                '**Note:** This is a secure, read-only connection. Your assets are always safe.'
            );

        const row = {
            type: 1,
            components: [{
                type: 2,
                style: 5, // Link button
                label: '🔗 Connect Wallet',
                url: verifyUrl
            }]
        };

        await interaction.reply({ 
            embeds: [embed], 
            components: [row],
            ephemeral: true 
        });
    } catch (error) {
        console.error('Error managing wallets:', error);
        await interaction.reply({ 
            content: 'Failed to start wallet verification. Please try again.',
            ephemeral: true 
        });
    }
}

async function handleServerRoles(interaction) {
    try {
        const embed = new EmbedBuilder()
            .setTitle('Server Roles')
            .setColor('#0154fa')
            .setDescription(
                '**Available Roles:**\n\n' +
                `<@&1322623738168213575> - Hold at least 1 NFT\n` +
                `<@&1322624148857557084> - Hold 10 or more NFTs\n\n` +
                'Connect your wallet to automatically receive roles based on your holdings.'
            );

        await interaction.reply({ embeds: [embed], ephemeral: true });
    } catch (error) {
        console.error('Error showing roles:', error);
        await interaction.reply({ 
            content: 'Failed to show server roles. Please try again.',
            ephemeral: true 
        });
    }
}

async function assignDiscordRoles(sessionId, walletAddress, hasStakedNFTs) {
    const userId = getUserIdFromSession(sessionId); // Implement this function to map sessionId to userId
    const totalNFTs = hasStakedNFTs ? 10 : 1; // Example logic

    await updateUserRoles(userId, totalNFTs);
}

async function displayRoles(interaction) {
    try {
        const userId = interaction.user.id;
        const userNFTs = await getUserNFTs(userId);
        
        let roleMessage = '';
        if (userNFTs > 0) {
            roleMessage += `<@&1322623738168213575>\n`; // At least 1 NFT role
            if (userNFTs >= 10) {
                roleMessage += `<@&1322624148857557084>\n`; // 10+ NFTs role
            }
        }

        const embed = new EmbedBuilder()
            .setTitle('Your Roles')
            .setDescription(roleMessage || 'No roles available. Please verify your wallet to receive roles.')
            .setColor('#2ecc71');

        await interaction.reply({ embeds: [embed], ephemeral: true });
    } catch (error) {
        console.error('Error displaying roles:', error);
        await interaction.reply({ content: 'Error displaying roles. Please try again later.', ephemeral: true });
    }
} 