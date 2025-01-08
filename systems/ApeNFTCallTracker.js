const axios = require('axios');
const { EmbedBuilder, AttachmentBuilder } = require('discord.js');
const QuickChart = require('quickchart-js');

class ApeNFTCallTracker {
    constructor(client) {
        if (!client) throw new Error('Discord client is required');
        this.client = client;
        this.activeCalls = new Map();
        this.milestones = [2, 3, 4, 5, 10, 20, 50];
        this.lastAlertTime = new Map();
        this.ALERT_COOLDOWN = 5 * 60 * 1000;
        
        // Start the tracking interval
        setInterval(() => this.checkAllCalls(), 60000);
    }

    async sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    async fetchNFTData(collectionAddress) {
        while (true) { // Keep trying forever until we get data
            try {
                // Use Magic Eden v3 API for APE NFTs
                const response = await axios.get(
                    `https://api-mainnet.magiceden.dev/v3/rtp/apechain/collections/v7?contract=${collectionAddress}`,
                    { 
                        headers: { 
                            'Accept': 'application/json',
                            'Authorization': `Bearer ${process.env.MAGIC_EDEN_API_KEY}`
                        } 
                    }
                );

                if (!response.data || !response.data.collections || response.data.collections.length === 0) {
                    throw new Error('Collection not found');
                }

                const collection = response.data.collections[0];
                
                return {
                    name: collection.name || collectionAddress,
                    symbol: collectionAddress,
                    floorPrice: collection.floorAsk?.price?.amount?.native || 0,
                    volume24h: collection.volume?.["1day"]?.native || 0,
                    listedCount: collection.tokenCount || 0,
                    priceChange24h: collection.floorAsk?.price?.change?.["1day"] || 0,
                    image: collection.image,
                    website: collection.externalUrl,
                    twitter: collection.twitterUsername ? `https://twitter.com/${collection.twitterUsername}` : null,
                    discord: collection.discordUrl
                };
            } catch (error) {
                console.log('Error fetching APE NFT data:', error.message);
                await this.sleep(Math.random() * 200);
                continue;
            }
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
                            `Initial Floor: ${(data.initialFloorPrice || data.floorPrice).toFixed(3)} APE`,
                            `Current Floor: ${data.floorPrice.toFixed(3)} APE | 24h Change: ${data.priceChange.toFixed(2)}%`
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
                                return value.toFixed(3) + ' APE';
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

    async createCall(channelId, callerUserId, collectionAddress) {
        try {
            const nftData = await this.fetchNFTData(collectionAddress);
            if (!nftData) {
                throw new Error('Could not fetch NFT data');
            }

            const caller = await this.client.users.fetch(callerUserId);
            const chartBuffer = await this.generateChart({
                floorPrice: nftData.floorPrice,
                initialFloorPrice: nftData.floorPrice,
                priceChange: nftData.priceChange24h,
                symbol: nftData.symbol || collectionAddress
            });

            const attachment = new AttachmentBuilder(chartBuffer, { name: 'chart.png' });

            const description = [
                `Called by: <@${callerUserId}>`,
                `**Initial Floor Price:** ${nftData.floorPrice.toFixed(3)} APE`,
                `**Current Floor Price:** ${nftData.floorPrice.toFixed(3)} APE`,
                `**24h Volume:** ${nftData.volume24h.toFixed(2)} APE`,
                `**Listed Count:** ${nftData.listedCount}`,
                `**24h Change:** ${nftData.priceChange24h.toFixed(2)}%`,
                '',
                `**ApeCoin:** [View Collection](https://market.apecoin.com/collection/${collectionAddress})`,
                `**BAYC:** [View Collection](https://bayc.com/collection/${collectionAddress})`
            ].join('\n');

            const embed = new EmbedBuilder()
                .setColor('#00ff00')
                .setTitle(`🎯 New APE NFT Call: ${nftData.name}`)
                .setDescription(description)
                .setImage('attachment://chart.png')
                .setTimestamp();

            if (nftData.image) {
                embed.setThumbnail(nftData.image);
            }

            const channel = await this.client.channels.fetch(channelId);
            const message = await channel.send({ 
                content: `<@&${process.env.HOLDERS_ROLE_ID}> New APE NFT call alert! 🚨`,
                embeds: [embed],
                files: [attachment]
            });

            // Store call data
            this.activeCalls.set(collectionAddress, {
                initialFloorPrice: nftData.floorPrice,
                messageId: message.id,
                channelId: channelId,
                symbol: nftData.symbol || collectionAddress,
                name: nftData.name,
                caller: caller.username,
                achievedMilestones: new Set(),
                lastUpdate: Date.now()
            });

        } catch (error) {
            console.error('Error creating APE NFT call:', error);
            throw error;
        }
    }

    async checkAllCalls() {
        for (const [collectionAddress, callData] of this.activeCalls.entries()) {
            try {
                const nftData = await this.fetchNFTData(collectionAddress);
                if (!nftData) continue;

                const currentFloorPrice = nftData.floorPrice;
                const multiplier = currentFloorPrice / callData.initialFloorPrice;

                // Check for new milestones
                for (const milestone of this.milestones) {
                    if (multiplier >= milestone && !callData.achievedMilestones.has(milestone)) {
                        await this.sendMilestoneAlert(collectionAddress, milestone, currentFloorPrice, callData);
                        callData.achievedMilestones.add(milestone);
                    }
                }
            } catch (error) {
                console.error(`Error checking APE NFT call ${collectionAddress}:`, error);
            }
        }
    }

    async sendMilestoneAlert(collectionAddress, milestone, currentFloorPrice, callData) {
        if (!this.canSendAlert(collectionAddress)) return;

        const embed = new EmbedBuilder()
            .setColor('#00ff00')
            .setTitle(`🎯 ${callData.name} Hit ${milestone}x!`)
            .setDescription(
                `**Initial Floor:** ${callData.initialFloorPrice.toFixed(3)} APE\n` +
                `**Current Floor:** ${currentFloorPrice.toFixed(3)} APE\n` +
                `**Multiplier:** ${milestone}x 🚀\n\n` +
                `**ApeCoin:** [View Collection](https://market.apecoin.com/collection/${collectionAddress})`
            )
            .setTimestamp();

        const channel = await this.client.channels.fetch(callData.channelId);
        await channel.send({
            content: `<@&${process.env.HOLDERS_ROLE_ID}> ${milestone}x milestone reached! 🎯`,
            embeds: [embed]
        });

        this.lastAlertTime.set(collectionAddress, Date.now());
    }

    canSendAlert(collectionAddress) {
        const lastAlert = this.lastAlertTime.get(collectionAddress) || 0;
        return Date.now() - lastAlert >= this.ALERT_COOLDOWN;
    }
}

module.exports = {
    createApeNFTCallTracker: function(client) {
        return new ApeNFTCallTracker(client);
    }
}; 