const axios = require('axios');
const { EmbedBuilder, AttachmentBuilder } = require('discord.js');
const QuickChart = require('quickchart-js');

class TokenCallTracker {
    constructor(client) {
        if (!client) throw new Error('Discord client is required');
        this.client = client;
        this.activeCalls = new Map();
        this.milestones = [2, 3, 4, 5, 10, 20, 50];
        this.lastAlertTime = new Map();
        this.ALERT_COOLDOWN = 5 * 60 * 1000;
        
        // Start the tracking interval
        setInterval(() => this.checkAllCalls(), 60000); // Check every minute
    }

    async createCall(channelId, callerUserId, tokenAddress, chain) {
        try {
            const tokenData = await this.fetchTokenData(tokenAddress, chain);
            if (!tokenData || !tokenData.pairs || tokenData.pairs.length === 0) {
                throw new Error(`Could not fetch token data for ${chain} token ${tokenAddress}`);
            }

            // Sort pairs by liquidity to get the main pair
            const pairs = tokenData.pairs.sort((a, b) => b.liquidity.usd - a.liquidity.usd);
            const mainPair = pairs[0];

            const caller = await this.client.users.fetch(callerUserId);
            const chartBuffer = await this.generateChart({
                price: parseFloat(mainPair.priceUsd),
                priceChange: mainPair.priceChange.h24,
                symbol: mainPair.baseToken.symbol,
                txns24h: mainPair.txns.h24
            });

            const attachment = new AttachmentBuilder(chartBuffer, { name: 'chart.png' });

            const description = [
                `Called by: <@${callerUserId}>`,
                `**Initial Market Cap:** $${this.formatNumber(mainPair.marketCap)}`,
                `**Current Price:** $${mainPair.priceUsd}`,
                `**24h Volume:** $${this.formatNumber(mainPair.volume.h24)}`,
                `**Liquidity:** $${this.formatNumber(mainPair.liquidity.usd)}`,
                `**24h Change:** ${mainPair.priceChange.h24}%`,
                `**24h Transactions:** ${mainPair.txns.h24.buys} buys, ${mainPair.txns.h24.sells} sells`,
                '',
                `**Contract Address:**\n\`${tokenAddress}\``,
                '',
                `**DEX:** ${mainPair.dexId}`,
                `**Chart:** [DexScreener](https://dexscreener.com/${mainPair.chainId}/${mainPair.pairAddress})`
            ].join('\n');

            const embed = new EmbedBuilder()
                .setColor('#00ff00')
                .setTitle(`🎯 New Token Call: ${mainPair.baseToken.symbol}`)
                .setDescription(description)
                .setImage('attachment://chart.png')
                .setTimestamp();

            if (mainPair.info?.imageUrl) {
                embed.setThumbnail(mainPair.info.imageUrl);
            }

            if (mainPair.info?.websites?.[0]) {
                embed.addFields({ name: 'Website', value: mainPair.info.websites[0].url, inline: true });
            }

            if (mainPair.info?.socials) {
                const socials = mainPair.info.socials
                    .map(social => `[${social.type}](${social.url})`)
                    .join(' | ');
                if (socials) {
                    embed.addFields({ name: 'Socials', value: socials, inline: true });
                }
            }

            const channel = await this.client.channels.fetch(channelId);
            const message = await channel.send({ 
                content: `<@&${process.env.HOLDERS_ROLE_ID}> New call alert! 🚨`,
                embeds: [embed],
                files: [attachment]
            });

            // Store call data with initial market cap
            this.activeCalls.set(tokenAddress, {
                initialPrice: parseFloat(mainPair.priceUsd),
                initialMarketCap: mainPair.marketCap,
                messageId: message.id,
                channelId: channelId,
                chain: chain,
                pairAddress: mainPair.pairAddress,
                symbol: mainPair.baseToken.symbol,
                caller: caller.username,
                achievedMilestones: new Set(),
                lastUpdate: Date.now()
            });

        } catch (error) {
            console.error('Error creating call:', error);
            throw error;
        }
    }

    async generateChart(data) {
        // Ensure we have at least two data points for a proper line
        const currentTime = new Date();
        const oneHourAgo = new Date(currentTime.getTime() - 60 * 60000);
        
        const prices = data.priceHistory || [data.price, data.price];
        const times = data.timeHistory || [oneHourAgo, currentTime];

        // Calculate min and max for Y axis with more generous padding
        const minPrice = Math.min(...prices) * 0.8; // 20% padding below
        const maxPrice = Math.max(...prices) * 1.2; // 20% padding above

        const chart = new QuickChart();
        chart.setWidth(800);
        chart.setHeight(400);
        chart.setBackgroundColor('#2F3136');

        const configuration = {
            type: 'line',
            data: {
                labels: times.map(time => {
                    const date = new Date(time);
                    return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
                }),
                datasets: [{
                    label: `${data.symbol} Price`,
                    data: prices,
                    borderColor: '#00ff00',
                    backgroundColor: '#00ff0022',
                    borderWidth: 2,
                    pointRadius: 1,
                    fill: true,
                    tension: 0.4
                }]
            },
            options: {
                animation: false,
                responsive: true,
                plugins: {
                    title: {
                        display: true,
                        text: [
                            `Price: $${data.price.toFixed(12)} | 24h Change: ${data.priceChange.toFixed(2)}%`,
                            `24h Transactions: ${data.txns24h.buys} buys, ${data.txns24h.sells} sells`
                        ],
                        color: '#fff',
                        font: { size: 16 }
                    },
                    legend: {
                        display: false
                    }
                },
                scales: {
                    x: {
                        grid: {
                            color: '#66666644'
                        },
                        ticks: {
                            color: '#fff',
                            maxRotation: 0
                        }
                    },
                    y: {
                        position: 'right',
                        min: minPrice,
                        max: maxPrice,
                        grid: {
                            color: '#66666644'
                        },
                        ticks: {
                            color: '#fff',
                            callback: function(value) {
                                return '$' + value.toFixed(12);
                            }
                        }
                    }
                }
            }
        };

        chart.setConfig(configuration);
        const chartUrl = await chart.getShortUrl();
        const response = await axios.get(chartUrl, { responseType: 'arraybuffer' });
        return response.data;
    }

    async fetchHistoricalData(tokenAddress) {
        try {
            // Fetch 24h of 5-minute candles
            const response = await axios.get(
                `https://api.dexscreener.com/latest/dex/candles`, {
                params: {
                    tokenAddress: tokenAddress,
                    from: Date.now() - 24 * 60 * 60 * 1000, // 24 hours ago
                    to: Date.now(),
                    resolution: '5m'
                }
            });

            return response.data.candles || [];
        } catch (error) {
            console.error('Error fetching historical data:', error);
            return [];
        }
    }

    async checkAllCalls() {
        for (const [tokenAddress, callData] of this.activeCalls.entries()) {
            try {
                const tokenData = await this.fetchTokenData(tokenAddress, callData.chain);
                if (!tokenData || !tokenData.pairs || tokenData.pairs.length === 0) continue;

                const mainPair = tokenData.pairs[0];
                const currentPrice = parseFloat(mainPair.priceUsd);
                const multiplier = currentPrice / callData.initialPrice;

                // Check for new milestones
                for (const milestone of this.milestones) {
                    if (multiplier >= milestone && !callData.achievedMilestones.has(milestone)) {
                        await this.sendMilestoneAlert(tokenAddress, milestone, currentPrice, callData);
                        callData.achievedMilestones.add(milestone);
                    }
                }
            } catch (error) {
                console.error(`Error checking call ${tokenAddress}:`, error);
            }
        }
    }

    async sendMilestoneAlert(tokenAddress, milestone, currentPrice, callData) {
        if (!this.canSendAlert(tokenAddress)) return;

        const embed = new EmbedBuilder()
            .setColor('#00ff00')
            .setTitle(`🎯 ${callData.symbol} Hit ${milestone}x!`)
            .setDescription(
                `**Initial Price:** $${callData.initialPrice.toFixed(6)}\n` +
                `**Current Price:** $${currentPrice.toFixed(6)}\n` +
                `**Multiplier:** ${milestone}x 🚀\n\n` +
                `**Contract Address:**\n\`${tokenAddress}\``
            )
            .setTimestamp();

        const channel = await this.client.channels.fetch(callData.channelId);
        await channel.send({
            content: `<@&${process.env.HOLDERS_ROLE_ID}> ${milestone}x milestone reached! 🎯`,
            embeds: [embed]
        });

        this.lastAlertTime.set(tokenAddress, Date.now());
    }

    canSendAlert(tokenAddress) {
        const lastAlert = this.lastAlertTime.get(tokenAddress) || 0;
        return Date.now() - lastAlert >= this.ALERT_COOLDOWN;
    }

    async fetchTokenData(tokenAddress, chain) {
        try {
            // Rate limit handling - 300 requests per minute
            const now = Date.now();
            if (this.lastRequestTime && now - this.lastRequestTime < 200) { // 200ms between requests
                await this.sleep(200);
            }
            this.lastRequestTime = now;

            // Use the correct DexScreener API endpoint
            const response = await axios.get(
                `https://api.dexscreener.com/latest/dex/tokens/${tokenAddress}`,
                {
                    headers: {
                        'Accept': 'application/json'
                    }
                }
            );

            if (!response.data || !response.data.pairs) {
                throw new Error('No pairs found for this token');
            }

            // Filter pairs for the specified chain if provided
            let pairs = response.data.pairs;
            if (chain) {
                pairs = pairs.filter(pair => pair.chainId.toLowerCase() === chain.toLowerCase());
            }

            // Sort pairs by liquidity to get the most relevant pair
            pairs.sort((a, b) => {
                const liquidityA = parseFloat(a.liquidity?.usd || 0);
                const liquidityB = parseFloat(b.liquidity?.usd || 0);
                return liquidityB - liquidityA;
            });

            if (pairs.length === 0) {
                throw new Error(`No pairs found for chain: ${chain}`);
            }

            // Log the response for debugging
            console.log('DexScreener response:', response);

            return response.data;
        } catch (error) {
            console.error('Error fetching token data:', error.response?.data || error.message);
            throw new Error(`Could not fetch token data: ${error.message}`);
        }
    }

    async sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    formatNumber(num) {
        return new Intl.NumberFormat('en-US', {
            maximumFractionDigits: 2,
            notation: 'compact',
            compactDisplay: 'short'
        }).format(num);
    }
}

module.exports = function createTokenCallTracker(client) {
    return new TokenCallTracker(client);
};