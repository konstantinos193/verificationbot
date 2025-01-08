const axios = require('axios');
const { EmbedBuilder, AttachmentBuilder } = require('discord.js');
const QuickChart = require('quickchart-js');

class SolanaNFTCallTracker {
    constructor(client) {
        if (!client) throw new Error('Discord client is required');
        this.client = client;
        this.activeCalls = new Map();
        this.milestones = [2, 3, 4, 5, 10, 20, 50];
        this.lastAlertTime = new Map();
        this.ALERT_COOLDOWN = 5 * 60 * 1000;
        
        // Rate limiting for public API (120 QPM, 2 QPS)
        this.lastRequestTime = 0;
        this.REQUEST_DELAY = 500; // 500ms between requests (2 QPS)
        this.MAX_RETRIES = 3;
        this.requestsThisMinute = 0;
        this.minuteStartTime = Date.now();
        
        // Start the tracking interval
        setInterval(() => this.checkAllCalls(), 60000); // Check every minute
        // Reset request counter every minute
        setInterval(() => {
            this.requestsThisMinute = 0;
            this.minuteStartTime = Date.now();
        }, 60000);
    }

    async sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    async makeRequest(url, retryCount = 0) {
        try {
            // Check minute limit
            if (this.requestsThisMinute >= 120) {
                const timeUntilReset = 60000 - (Date.now() - this.minuteStartTime);
                if (timeUntilReset > 0) {
                    console.log(`Rate limit reached, waiting ${timeUntilReset}ms for next minute`);
                    await this.sleep(timeUntilReset);
                    this.requestsThisMinute = 0;
                    this.minuteStartTime = Date.now();
                }
            }

            // Ensure minimum delay between requests
            const now = Date.now();
            const timeSinceLastRequest = now - this.lastRequestTime;
            if (timeSinceLastRequest < this.REQUEST_DELAY) {
                await this.sleep(this.REQUEST_DELAY - timeSinceLastRequest);
            }

            this.lastRequestTime = Date.now();
            this.requestsThisMinute++;
            
            // Using API key directly for testing
            const headers = {
                'Authorization': 'Bearer 87f9972e-986d-490d-9ffe-74236a9f4e1e',
                'Accept': 'application/json'
            };

            console.log('Making request with headers:', headers); // Debug log
            const response = await axios.get(url, { headers });
            return response;
        } catch (error) {
            console.error('Request error details:', {
                status: error.response?.status,
                data: error.response?.data,
                headers: error.response?.headers
            });
            
            if (error.response?.status === 429 && retryCount < this.MAX_RETRIES) {
                const waitTime = (retryCount + 1) * 2000;
                console.log(`Rate limited, waiting ${waitTime}ms before retry ${retryCount + 1}/${this.MAX_RETRIES}`);
                await this.sleep(waitTime);
                return this.makeRequest(url, retryCount + 1);
            }
            throw error;
        }
    }

    async createCall(channelId, callerUserId, collectionSymbol) {
        try {
            const nftData = await this.fetchNFTData(collectionSymbol);
            if (!nftData) {
                throw new Error('Could not fetch NFT data');
            }

            const caller = await this.client.users.fetch(callerUserId);
            const chartBuffer = await this.generateChart({
                floorPrice: nftData.floorPrice,
                initialFloorPrice: nftData.floorPrice,
                priceChange: nftData.priceChange24h,
                symbol: nftData.symbol || collectionSymbol
            });

            const attachment = new AttachmentBuilder(chartBuffer, { name: 'chart.png' });

            const description = [
                `Called by: <@${callerUserId}>`,
                `**Initial Floor Price:** ${nftData.floorPrice.toFixed(3)} SOL`,
                `**Current Floor Price:** ${nftData.floorPrice.toFixed(3)} SOL`,
                `**24h Volume:** ${nftData.volume24h.toFixed(2)} SOL`,
                `**Listed Count:** ${nftData.listedCount}`,
                `**24h Change:** ${nftData.priceChange24h.toFixed(2)}%`,
                '',
                `**Magic Eden:** [View Collection](https://magiceden.io/marketplace/${collectionSymbol})`,
                `**Tensor:** [View Collection](https://www.tensor.trade/trade/${collectionSymbol})`,
            ].join('\n');

            const embed = new EmbedBuilder()
                .setColor('#00ff00')
                .setTitle(`🎯 New NFT Call: ${nftData.name}`)
                .setDescription(description)
                .setImage('attachment://chart.png')
                .setTimestamp();

            if (nftData.image) {
                embed.setThumbnail(nftData.image);
            }

            if (nftData.website) {
                embed.addFields({ name: 'Website', value: nftData.website, inline: true });
            }

            if (nftData.twitter) {
                embed.addFields({ name: 'Twitter', value: nftData.twitter, inline: true });
            }

            if (nftData.discord) {
                embed.addFields({ name: 'Discord', value: nftData.discord, inline: true });
            }

            const channel = await this.client.channels.fetch(channelId);
            const message = await channel.send({ 
                content: `<@&${process.env.HOLDERS_ROLE_ID}> New NFT call alert! 🚨`,
                embeds: [embed],
                files: [attachment]
            });

            // Store call data
            this.activeCalls.set(collectionSymbol, {
                initialFloorPrice: nftData.floorPrice,
                messageId: message.id,
                channelId: channelId,
                symbol: nftData.symbol || collectionSymbol,
                name: nftData.name,
                caller: caller.username,
                achievedMilestones: new Set(),
                lastUpdate: Date.now()
            });

        } catch (error) {
            console.error('Error creating NFT call:', error);
            throw error;
        }
    }

    async generateChart(data) {
        const chart = new QuickChart();
        chart.setWidth(800);
        chart.setHeight(400);
        chart.setBackgroundColor('#2F3136');

        const configuration = {
            type: 'line',
            data: {
                labels: ['Initial', 'Current'],
                datasets: [{
                    label: `${data.symbol} Floor Price`,
                    data: [data.initialFloorPrice || data.floorPrice, data.floorPrice],
                    borderColor: '#00ff00',
                    backgroundColor: '#00ff0022',
                    borderWidth: 2,
                    pointRadius: 4,
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
                            `Initial Floor: ${(data.initialFloorPrice || data.floorPrice).toFixed(3)} SOL`,
                            `Current Floor: ${data.floorPrice.toFixed(3)} SOL | 24h Change: ${data.priceChange.toFixed(2)}%`
                        ],
                        color: '#fff',
                        font: { size: 16 }
                    },
                    legend: {
                        display: false
                    }
                },
                scales: {
                    y: {
                        beginAtZero: false,
                        grid: {
                            color: '#66666644'
                        },
                        ticks: {
                            color: '#fff',
                            callback: function(value) {
                                return value.toFixed(3) + ' SOL';
                            }
                        }
                    },
                    x: {
                        grid: {
                            display: false
                        },
                        ticks: {
                            color: '#fff'
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

    async fetchNFTData(collectionSymbol) {
        while (true) { // Keep trying forever until we get data
            try {
                // Just try the main endpoint since we know it works
                const statsResponse = await axios.get(
                    `https://api-mainnet.magiceden.dev/v2/collections/${collectionSymbol}/stats`,
                    { headers: { 'Accept': 'application/json' } }
                );

                const stats = statsResponse.data;
                
                // Convert lamports to SOL (1 SOL = 1,000,000,000 lamports)
                const floorPriceSOL = parseFloat((stats.floorPrice / 1e9).toFixed(3));
                const avgPrice24hrSOL = parseFloat((stats.avgPrice24hr / 1e9).toFixed(3));
                const volume24hSOL = parseFloat((stats.volumeAll / 1e9).toFixed(2));

                // Calculate 24h price change
                const priceChange24h = avgPrice24hrSOL ? 
                    parseFloat(((floorPriceSOL - avgPrice24hrSOL) / avgPrice24hrSOL * 100).toFixed(2)) : 0;

                return {
                    name: collectionSymbol,
                    symbol: collectionSymbol,
                    floorPrice: floorPriceSOL,
                    volume24h: volume24hSOL,
                    listedCount: stats.listedCount,
                    priceChange24h: priceChange24h,
                    image: null,
                    website: null,
                    twitter: null,
                    discord: null
                };
            } catch {
                await this.sleep(Math.random() * 200);
                continue;
            }
        }
    }

    async checkAllCalls() {
        for (const [collectionSymbol, callData] of this.activeCalls.entries()) {
            try {
                const nftData = await this.fetchNFTData(collectionSymbol);
                if (!nftData) continue;

                const currentFloorPrice = nftData.floorPrice;
                const multiplier = currentFloorPrice / callData.initialFloorPrice;

                // Update chart with both initial and current floor prices
                const chartBuffer = await this.generateChart({
                    floorPrice: currentFloorPrice,
                    initialFloorPrice: callData.initialFloorPrice,
                    priceChange: nftData.priceChange24h,
                    symbol: callData.symbol
                });

                // Check for new milestones
                for (const milestone of this.milestones) {
                    if (multiplier >= milestone && !callData.achievedMilestones.has(milestone)) {
                        await this.sendMilestoneAlert(collectionSymbol, milestone, currentFloorPrice, callData);
                        callData.achievedMilestones.add(milestone);
                    }
                }
            } catch (error) {
                console.error(`Error checking NFT call ${collectionSymbol}:`, error);
            }
        }
    }

    async sendMilestoneAlert(collectionSymbol, milestone, currentFloorPrice, callData) {
        if (!this.canSendAlert(collectionSymbol)) return;

        const embed = new EmbedBuilder()
            .setColor('#00ff00')
            .setTitle(`🎯 ${callData.name} Hit ${milestone}x!`)
            .setDescription(
                `**Initial Floor:** ${callData.initialFloorPrice.toFixed(2)} SOL\n` +
                `**Current Floor:** ${currentFloorPrice.toFixed(2)} SOL\n` +
                `**Multiplier:** ${milestone}x 🚀\n\n` +
                `**Magic Eden:** [View Collection](https://magiceden.io/marketplace/${collectionSymbol})`
            )
            .setTimestamp();

        const channel = await this.client.channels.fetch(callData.channelId);
        await channel.send({
            content: `<@&${process.env.HOLDERS_ROLE_ID}> ${milestone}x milestone reached! 🎯`,
            embeds: [embed]
        });

        this.lastAlertTime.set(collectionSymbol, Date.now());
    }

    canSendAlert(collectionSymbol) {
        const lastAlert = this.lastAlertTime.get(collectionSymbol) || 0;
        return Date.now() - lastAlert >= this.ALERT_COOLDOWN;
    }

    formatNumber(num) {
        return new Intl.NumberFormat('en-US', {
            maximumFractionDigits: 2,
            notation: 'compact',
            compactDisplay: 'short'
        }).format(num);
    }
}

module.exports = {
    createSolanaNFTCallTracker: function(client) {
        return new SolanaNFTCallTracker(client);
    }
}; 