const { EmbedBuilder } = require('discord.js');

class LeaderboardManager {
    constructor(client) {
        if (!client) throw new Error('Discord client is required');
        this.client = client;
        this.LEADERBOARD_CHANNEL_ID = '1311066306266529792';
        this.UPDATE_INTERVAL = 24 * 60 * 60 * 1000; // 24 hours

        // Start the leaderboard updates
        this.startLeaderboardUpdates();
    }

    async startLeaderboardUpdates() {
        console.log('Starting leaderboard system...');
        
        // Initial update
        await this.updateLeaderboards();
        
        // Set up periodic updates
        setInterval(() => this.updateLeaderboards(), this.UPDATE_INTERVAL);
    }

    async updateLeaderboards() {
        try {
            console.log('Updating leaderboards...');

            // Collect all active calls
            const allCalls = await this.collectAllCalls();

            // Calculate PnL for each call
            const callsWithPnL = await this.calculatePnL(allCalls);

            // Sort by PnL and get top 10
            const topCalls = this.getTopCalls(callsWithPnL);

            // Generate and send leaderboard
            await this.sendLeaderboard(topCalls);

        } catch (error) {
            console.error('Error updating leaderboards:', error);
        }
    }

    async collectAllCalls() {
        const calls = [];

        // Collect Solana NFT calls
        for (const [symbol, call] of this.client.solanaNFTCallTracker.activeCalls) {
            calls.push({
                type: 'Solana NFT',
                symbol,
                initialPrice: call.initialFloorPrice,
                caller: call.caller,
                timestamp: call.lastUpdate
            });
        }

        // Collect ETH NFT calls
        for (const [address, call] of this.client.ethNFTCallTracker.activeCalls) {
            calls.push({
                type: 'ETH NFT',
                symbol: address,
                initialPrice: call.initialFloorPrice,
                caller: call.caller,
                timestamp: call.lastUpdate
            });
        }

        // Collect APE NFT calls
        for (const [address, call] of this.client.apeNFTCallTracker.activeCalls) {
            calls.push({
                type: 'APE NFT',
                symbol: address,
                initialPrice: call.initialFloorPrice,
                caller: call.caller,
                timestamp: call.lastUpdate
            });
        }

        // Collect Ordinal calls
        for (const [symbol, call] of this.client.ordinalCallTracker.activeCalls) {
            calls.push({
                type: 'Ordinal',
                symbol,
                initialPrice: call.initialFloorPrice,
                caller: call.caller,
                timestamp: call.lastUpdate
            });
        }

        return calls;
    }

    async calculatePnL(calls) {
        const callsWithPnL = [];

        for (const call of calls) {
            try {
                let currentPrice;

                switch (call.type) {
                    case 'Solana NFT':
                        currentPrice = await this.client.solanaNFTCallTracker.getCurrentPrice(call.symbol);
                        break;
                    case 'ETH NFT':
                        currentPrice = await this.client.ethNFTCallTracker.getCurrentPrice(call.symbol);
                        break;
                    case 'APE NFT':
                        currentPrice = await this.client.apeNFTCallTracker.getCurrentPrice(call.symbol);
                        break;
                    case 'Ordinal':
                        currentPrice = await this.client.ordinalCallTracker.getCurrentPrice(call.symbol);
                        break;
                }

                if (currentPrice && call.initialPrice) {
                    const pnlMultiple = currentPrice / call.initialPrice;
                    callsWithPnL.push({
                        ...call,
                        currentPrice,
                        pnlMultiple
                    });
                }
            } catch (error) {
                console.error(`Error calculating PnL for ${call.type} ${call.symbol}:`, error);
            }
        }

        return callsWithPnL;
    }

    getTopCalls(calls) {
        // Sort by PnL multiple in descending order
        return calls
            .sort((a, b) => b.pnlMultiple - a.pnlMultiple)
            .slice(0, 10);
    }

    async sendLeaderboard(topCalls) {
        const channel = await this.client.channels.fetch(this.LEADERBOARD_CHANNEL_ID);
        if (!channel) return;

        // Clear previous leaderboard messages
        const messages = await channel.messages.fetch({ limit: 10 });
        await channel.bulkDelete(messages);

        const embed = new EmbedBuilder()
            .setTitle('🏆 Top 10 Calls Leaderboard')
            .setColor('#00ff00')
            .setDescription(
                topCalls.map((call, index) => {
                    const pnlPercentage = ((call.pnlMultiple - 1) * 100).toFixed(2);
                    const emoji = index < 3 ? ['🥇', '🥈', '🥉'][index] : '🏅';
                    return `${emoji} **${call.caller}** - ${call.type}\n` +
                           `Symbol: \`${call.symbol}\`\n` +
                           `PnL: ${pnlPercentage}% (${call.pnlMultiple.toFixed(2)}x)\n` +
                           `Entry: ${this.formatPrice(call.initialPrice, call.type)}\n` +
                           `Current: ${this.formatPrice(call.currentPrice, call.type)}\n`;
                }).join('\n')
            )
            .setTimestamp()
            .setFooter({ 
                text: 'Ape Elite Club • Daily Leaderboard',
                iconURL: 'https://i.imgur.com/QABnvka.jpeg'
            });

        await channel.send({ embeds: [embed] });
    }

    formatPrice(price, type) {
        switch (type) {
            case 'Solana NFT':
                return `${price} SOL`;
            case 'ETH NFT':
                return `${price} ETH`;
            case 'APE NFT':
                return `${price} APE`;
            case 'Ordinal':
                return `${price} BTC`;
            default:
                return `${price}`;
        }
    }
}

function createLeaderboardManager(client) {
    return new LeaderboardManager(client);
}

module.exports = { createLeaderboardManager }; 