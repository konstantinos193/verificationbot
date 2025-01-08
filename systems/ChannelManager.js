const { EmbedBuilder } = require('discord.js');

class ChannelManager {
    constructor() {
        // Main Ecosystems
        this.channels = {
            // APE Ecosystem
            APE_CALLS: process.env.APE_CALLS_CHANNEL_ID,
            APE_NFTS: process.env.APE_NFTS_CHANNEL_ID,
            APE_RESEARCH: process.env.APE_RESEARCH_CHANNEL_ID,
            
            // SOL Ecosystem
            SOL_CALLS: process.env.SOL_CALLS_CHANNEL_ID,
            SOL_NFTS: process.env.SOL_NFTS_CHANNEL_ID,
            SOL_RESEARCH: process.env.SOL_RESEARCH_CHANNEL_ID,
            
            // BTC Ecosystem
            RUNE_CALLS: process.env.RUNE_CALLS_CHANNEL_ID,
            ORDINALS: process.env.ORDINALS_CHANNEL_ID,
            BTC_RESEARCH: process.env.BTC_RESEARCH_CHANNEL_ID,
            
            // Research & Analysis
            MACRO_ANALYSIS: process.env.MACRO_ANALYSIS_CHANNEL_ID,
            MARKET_SENTIMENT: process.env.MARKET_SENTIMENT_CHANNEL_ID,
            PROJECT_DEEP_DIVES: process.env.PROJECT_DEEP_DIVES_CHANNEL_ID,
            
            // Trading & Signals
            DERIVATIVES_CALLS: process.env.DERIVATIVES_CALLS_CHANNEL_ID,
            BREAKOUT_SIGNALS: process.env.BREAKOUT_SIGNALS_CHANNEL_ID,
            WHALE_TRACKING: process.env.WHALE_TRACKING_CHANNEL_ID
        };

        // Message Templates
        this.templates = {
            CALL: {
                SPOT: this.createSpotCallEmbed,
                DERIVATIVES: this.createDerivativesCallEmbed,
                NFT: this.createNFTCallEmbed
            },
            RESEARCH: {
                MACRO: this.createMacroAnalysisEmbed,
                PROJECT: this.createProjectAnalysisEmbed,
                MARKET: this.createMarketAnalysisEmbed
            }
        };
    }

    // Template Methods
    createSpotCallEmbed(data) {
        return new EmbedBuilder()
            .setColor('#0099ff')
            .setTitle(`${data.chain} Spot Call: ${data.asset}`)
            .addFields(
                { name: 'Entry Zone', value: data.entry, inline: true },
                { name: 'Stop Loss', value: data.stopLoss, inline: true },
                { name: 'Targets', value: data.targets.join('\n') },
                { name: 'Timeframe', value: data.timeframe },
                { name: 'Risk Level', value: data.riskLevel }
            )
            .setTimestamp();
    }

    createDerivativesCallEmbed(data) {
        return new EmbedBuilder()
            .setColor('#ff9900')
            .setTitle(`${data.chain} Derivatives Call: ${data.asset}`)
            .addFields(
                { name: 'Direction', value: data.direction, inline: true },
                { name: 'Leverage', value: `${data.leverage}x`, inline: true },
                { name: 'Entry Zone', value: data.entry },
                { name: 'Stop Loss', value: data.stopLoss },
                { name: 'Targets', value: data.targets.join('\n') },
                { name: '⚠️ Risk Warning', value: 'High leverage trading carries significant risk of loss' }
            )
            .setTimestamp();
    }

    // Posting Methods
    async postCall(type, chain, data) {
        try {
            let channelId;
            let embed;

            switch (type) {
                case 'SPOT':
                    channelId = this.channels[`${chain}_CALLS`];
                    embed = this.templates.CALL.SPOT(data);
                    break;
                case 'NFT':
                    channelId = this.channels[`${chain}_NFTS`];
                    embed = this.templates.CALL.NFT(data);
                    break;
                case 'DERIVATIVES':
                    channelId = this.channels.DERIVATIVES_CALLS;
                    embed = this.templates.CALL.DERIVATIVES(data);
                    break;
            }

            const channel = await client.channels.fetch(channelId);
            return await channel.send({ embeds: [embed] });
        } catch (error) {
            console.error('Error posting call:', error);
            throw error;
        }
    }
}

module.exports = new ChannelManager(); 