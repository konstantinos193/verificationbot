const { EmbedBuilder, AttachmentBuilder } = require('discord.js');
const QuickChart = require('quickchart-js');
const axios = require('axios');

class OrdinalCallTracker {
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

    async fetchOrdinalData(symbol) {
        while (true) {  // Keep trying indefinitely
            try {
                console.log(`Attempting to fetch ordinal data for symbol: ${symbol}`);
                
                // Get collection stats - using the exact endpoint from docs
                console.log('Fetching collection stats...');
                const stats = await axios.get(
                    `https://api-mainnet.magiceden.dev/v2/ord/btc/stat`,
                    {
                        params: {
                            collectionSymbol: symbol
                        },
                        headers: {
                            'accept': 'application/json',
                            'Authorization': `Bearer ${process.env.MAGIC_EDEN_API_KEY}`
                        }
                    }
                );
                
                if (!stats.data) {
                    console.log('No stats data, retrying...');
                    await new Promise(resolve => setTimeout(resolve, 2000));
                    continue;
                }

                // Get collection info
                console.log('Fetching collection info...');
                const collection = await axios.get(
                    `https://api-mainnet.magiceden.dev/v2/ord/btc/collections/${symbol}`,
                    {
                        headers: {
                            'accept': 'application/json',
                            'Authorization': `Bearer ${process.env.MAGIC_EDEN_API_KEY}`
                        }
                    }
                );

                if (!collection.data) {
                    console.log('No collection data, retrying...');
                    await new Promise(resolve => setTimeout(resolve, 2000));
                    continue;
                }

                // Get recent activities
                console.log('Fetching activities...');
                const activities = await axios.get(
                    `https://api-mainnet.magiceden.dev/v2/ord/btc/activities`,
                    {
                        params: {
                            collectionSymbol: symbol,
                            limit: 100,
                            offset: 0
                        },
                        headers: {
                            'accept': 'application/json',
                            'Authorization': `Bearer ${process.env.MAGIC_EDEN_API_KEY}`
                        }
                    }
                );

                if (!activities.data) {
                    console.log('No activities data, retrying...');
                    await new Promise(resolve => setTimeout(resolve, 2000));
                    continue;
                }

                // If we got here, we have all the data we need
                return {
                    stats: stats.data,
                    collection: collection.data,
                    activities: activities.data
                };

            } catch (error) {
                // Log the error but don't throw it
                console.log('Error fetching ordinal data:', {
                    error: error.message,
                    status: error.response?.status,
                    data: error.response?.data
                });

                // If it's a rate limit error, wait longer
                if (error.response?.status === 429) {
                    console.log('Rate limit hit, waiting 65 seconds before retry...');
                    await new Promise(resolve => setTimeout(resolve, 65000));
                } else {
                    // For other errors, wait a shorter time
                    console.log('Waiting 2 seconds before retry...');
                    await new Promise(resolve => setTimeout(resolve, 2000));
                }
                // Continue the loop to retry
                continue;
            }
        }
    }

    formatNumber(num) {
        return new Intl.NumberFormat('en-US').format(num);
    }

    async createCall(channelId, callerUserId, symbol) {
        try {
            console.log(`Creating ordinal call for symbol: ${symbol}, channel: ${channelId}, caller: ${callerUserId}`);
            
            const ordinalData = await this.fetchOrdinalData(symbol);
            if (!ordinalData || !ordinalData.stats) {
                throw new Error('Could not fetch ordinal data');
            }

            console.log('Fetching caller info...');
            const caller = await this.client.users.fetch(callerUserId);
            console.log('Generating chart...');
            const chartBuffer = await this.generateChart(ordinalData);

            const attachment = new AttachmentBuilder(chartBuffer, { name: 'chart.png' });

            const floorPrice = ordinalData.stats.floorPrice || 'N/A';
            const volume24h = ordinalData.stats.volume24h || 0;
            const totalVolume = ordinalData.stats.totalVolume || 0;
            const listedCount = ordinalData.stats.listedCount || 0;

            console.log('Creating embed message...');
            const description = [
                `Called by: <@${callerUserId}>`,
                `**Initial Floor Price:** ${floorPrice} BTC`,
                `**Current Floor Price:** ${floorPrice} BTC`,
                `**24h Volume:** ${this.formatNumber(volume24h)} BTC`,
                `**Total Volume:** ${this.formatNumber(totalVolume)} BTC`,
                `**Listed Count:** ${listedCount}`,
                '',
                `**Collection:** ${ordinalData.collection.name || symbol}`,
                '',
                `**Magic Eden:** [View Collection](https://magiceden.io/ordinals/collections/${symbol})`
            ].join('\n');

            const embed = new EmbedBuilder()
                .setColor('#00ff00')
                .setTitle(`🎯 New Ordinal Call: ${ordinalData.collection.name || symbol}`)
                .setDescription(description)
                .setImage('attachment://chart.png')
                .setTimestamp();

            console.log('Sending message to channel...');
            const channel = await this.client.channels.fetch(channelId);
            const message = await channel.send({ 
                content: `<@&${process.env.HOLDERS_ROLE_ID}> New ordinal call alert! 🚨`,
                embeds: [embed],
                files: [attachment]
            });
            console.log('Message sent successfully');

            // Store call data
            this.activeCalls.set(symbol, {
                initialFloorPrice: floorPrice,
                messageId: message.id,
                channelId: channelId,
                symbol: symbol,
                caller: caller.username,
                achievedMilestones: new Set(),
                lastUpdate: Date.now()
            });
            console.log('Call data stored successfully');

        } catch (error) {
            console.error('Error creating ordinal call:', {
                error: error.message,
                stack: error.stack,
                symbol,
                channelId,
                callerUserId
            });
            throw error;
        }
    }

    async generateChart(ordinalData) {
        const activities = ordinalData.activities || [];
        const times = activities.map(a => new Date(a.timestamp));
        const prices = activities.map(a => a.price);

        if (times.length < 2) {
            times.unshift(new Date(Date.now() - 24 * 60 * 60 * 1000));
            prices.unshift(prices[0] || 0);
        }

        const minPrice = Math.min(...prices) * 0.8;
        const maxPrice = Math.max(...prices) * 1.2;

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
                    label: 'Price (BTC)',
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
                            `Floor Price: ${ordinalData.stats.floorPrice || 'N/A'} BTC`,
                            `24h Volume: ${this.formatNumber(ordinalData.stats.volume24h || 0)} BTC`
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
                        min: minPrice,
                        max: maxPrice,
                        grid: {
                            color: '#66666644'
                        },
                        ticks: {
                            color: '#fff',
                            callback: function(value) {
                                return value.toFixed(8) + ' BTC';
                            }
                        }
                    },
                    x: {
                        grid: {
                            color: '#66666644'
                        },
                        ticks: {
                            color: '#fff',
                            maxRotation: 0
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

    async checkAllCalls() {
        for (const [symbol, callData] of this.activeCalls.entries()) {
            try {
                const ordinalData = await this.fetchOrdinalData(symbol);
                if (!ordinalData || !ordinalData.stats) continue;

                const currentFloorPrice = ordinalData.stats.floorPrice;
                if (!currentFloorPrice) continue;

                const priceChange = (currentFloorPrice - callData.initialFloorPrice) / callData.initialFloorPrice * 100;
                
                // Check milestones
                for (const milestone of this.milestones) {
                    if (priceChange >= milestone && !callData.achievedMilestones.has(milestone)) {
                        const lastAlertKey = `${symbol}-${milestone}`;
                        const lastAlertTime = this.lastAlertTime.get(lastAlertKey) || 0;
                        
                        if (Date.now() - lastAlertTime >= this.ALERT_COOLDOWN) {
                            const channel = await this.client.channels.fetch(callData.channelId);
                            await channel.send({
                                content: `🎯 **Ordinal Call Update** 🎯\n${symbol} has reached a ${milestone}% increase from the initial call!\nInitial Price: ${callData.initialFloorPrice} BTC\nCurrent Price: ${currentFloorPrice} BTC\nCalled by: ${callData.caller}`
                            });
                            
                            callData.achievedMilestones.add(milestone);
                            this.lastAlertTime.set(lastAlertKey, Date.now());
                        }
                    }
                }
                
                // Update the call data
                callData.lastUpdate = Date.now();
                this.activeCalls.set(symbol, callData);
                
            } catch (error) {
                console.error(`Error checking ordinal call for ${symbol}:`, error);
            }
        }
    }
}

function createOrdinalCallTracker(client) {
    return new OrdinalCallTracker(client);
}

module.exports = { createOrdinalCallTracker }; 