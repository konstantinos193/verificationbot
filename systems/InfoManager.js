const { EmbedBuilder } = require('discord.js');

class InfoManager {
    constructor(client) {
        if (!client) throw new Error('Discord client is required');
        this.client = client;
        this.INFO_CHANNEL_ID = '1311066248381071473';
        
        // Post initial info with delay to ensure client is ready
        setTimeout(() => this.postBotInfo(), 5000);
    }

    async postBotInfo() {
        try {
            console.log('Attempting to post bot info...');
            const channel = await this.client.channels.fetch(this.INFO_CHANNEL_ID);
            if (!channel) {
                console.error('Could not find info channel');
                return;
            }

            // Clear existing messages
            const messages = await channel.messages.fetch({ limit: 100 });
            if (messages.size > 0) {
                await channel.bulkDelete(messages);
            }

            // Main Features Embed
            const mainEmbed = new EmbedBuilder()
                .setTitle('🤖 Ape Elite Club Alpha Bot')
                .setColor('#0154fa')
                .setDescription('Your all-in-one solution for tracking and analyzing market opportunities across multiple chains.')
                .addFields({
                    name: '🎯 Market Tracking',
                    value: '• Solana NFT Collections\n' +
                           '• Ethereum NFT Collections\n' +
                           '• BTC Runes\n' +
                           '• BTC Ordinals\n' +
                           '• Token Prices'
                });

            // Market Analysis Embed
            const analysisEmbed = new EmbedBuilder()
                .setTitle('📊 Market Analysis Features')
                .setColor('#00ff00')
                .addFields(
                    {
                        name: '📈 Automated Market Analysis',
                        value: '• Real-time market sentiment updates every 5 minutes\n' +
                               '• Macro market analysis every 15 minutes\n' +
                               '• Order book analysis and large walls detection\n' +
                               '• Liquidation tracking and alerts\n' +
                               '• Open interest monitoring'
                    },
                    {
                        name: '🏆 Daily Leaderboards',
                        value: '• Top 10 most profitable calls across all categories\n' +
                               '• Updated every 24 hours\n' +
                               '• Tracks performance multipliers (x initial)\n' +
                               '• Includes all active calls from every chain'
                    }
                );

            // Channels Overview Embed
            const channelsEmbed = new EmbedBuilder()
                .setTitle('📱 Dedicated Channels')
                .setColor('#ff9900')
                .addFields(
                    {
                        name: '🌐 Solana Ecosystem',
                        value: '<#1311066622274048111> SOL Token Calls\n' +
                               '<#1311066682118246481> SOL NFT Calls\n' +
                               '<#1311066700984221736> SOL Research',
                        inline: true
                    },
                    {
                        name: '⚡ Ethereum Ecosystem',
                        value: '<#1322736058693189642> ETH Token Calls\n' +
                               '<#1322736113818931290> ETH NFT Calls\n' +
                               '<#1322736161197789224> ETH Research',
                        inline: true
                    },
                    {
                        name: '🦍 APE Ecosystem',
                        value: '<#1311066498441150614> APE NFT Calls\n' +
                               '<#1311066533505536051> APE Research',
                        inline: true
                    }
                );

            // More Channels Embed
            const moreChannelsEmbed = new EmbedBuilder()
                .setColor('#ff9900')
                .addFields(
                    {
                        name: '₿ Bitcoin Ecosystem',
                        value: '<#1311069037433983101> Rune Calls\n' +
                               '<#1311069195613503541> Ordinals\n' +
                               '<#1311069242078134283> BTC Research',
                        inline: true
                    },
                    {
                        name: '📊 Market Analysis',
                        value: '<#1311070631382614087> Macro Analysis\n' +
                               '<#1311070648906551386> Market Sentiment\n' +
                               '<#1311070669563367518> Deep Dives',
                        inline: true
                    },
                    {
                        name: '🎯 Trading Signals',
                        value: '<#1311070801780281354> Breakout Signals\n' +
                               '<#1311070785418297364> Whale Tracking',
                        inline: true
                    }
                );

            // Additional Features Embed
            const featuresEmbed = new EmbedBuilder()
                .setTitle('🔍 Additional Features')
                .setColor('#ff00ff')
                .addFields(
                    {
                        name: '⚙️ Automated Tracking',
                        value: '• Real-time price monitoring\n' +
                               '• Automatic PnL calculation\n' +
                               '• Performance multiplier tracking\n' +
                               '• Entry and current price comparisons',
                        inline: true
                    },
                    {
                        name: '📱 Data Sources',
                        value: '• Magic Eden API integration\n' +
                               '• DexScreener market data\n' +
                               '• Binance order book data\n' +
                               '• CoinGlass liquidation data',
                        inline: true
                    },
                    {
                        name: '🔔 Alerts & Notifications',
                        value: '• Significant price movements\n' +
                               '• Large market orders\n' +
                               '• Whale movements\n' +
                               '• Market structure changes',
                        inline: true
                    }
                )
                .setFooter({
                    text: 'Ape Elite Club • Alpha Bot Information',
                    iconURL: 'https://i.imgur.com/QABnvka.jpeg'
                });

            // Send all embeds
            await channel.send({ embeds: [mainEmbed] });
            await channel.send({ embeds: [analysisEmbed] });
            await channel.send({ embeds: [channelsEmbed] });
            await channel.send({ embeds: [moreChannelsEmbed] });
            await channel.send({ embeds: [featuresEmbed] });

        } catch (error) {
            console.error('Error posting bot info:', error);
            if (error.code) console.error('Error code:', error.code);
            if (error.message) console.error('Error message:', error.message);
            if (error.stack) console.error('Stack trace:', error.stack);
        }
    }
}

function createInfoManager(client) {
    return new InfoManager(client);
}

module.exports = { createInfoManager }; 