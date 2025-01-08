const axios = require('axios');
const { EmbedBuilder, AttachmentBuilder } = require('discord.js');
const QuickChart = require('quickchart-js');

class RuneCallTracker {
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

    async fetchRuneData(runeSymbol) {
        while (true) {  // Keep trying indefinitely
            try {
                console.log(`Attempting to fetch rune data for symbol: ${runeSymbol}`);
                
                // Get market info
                console.log('Fetching market info...');
                const marketInfo = await axios.get(
                    `https://api-mainnet.magiceden.dev/v2/ord/btc/runes/market/${runeSymbol}/info`,
                    {
                        headers: {
                            'accept': 'application/json',
                            'Authorization': `Bearer ${process.env.MAGIC_EDEN_API_KEY}`
                        }
                    }
                );
                
                if (!marketInfo.data) {
                    console.log('No market info data, retrying...');
                    await new Promise(resolve => setTimeout(resolve, 2000));
                    continue;
                }

                // Get orders
                console.log('Fetching orders...');
                const orders = await axios.get(
                    `https://api-mainnet.magiceden.dev/v2/ord/btc/runes/orders/${runeSymbol}?side=sell&sort=unitPriceAsc`,
                    {
                        headers: {
                            'accept': 'application/json',
                            'Authorization': `Bearer ${process.env.MAGIC_EDEN_API_KEY}`
                        }
                    }
                );

                if (!orders.data) {
                    console.log('No orders data, retrying...');
                    await new Promise(resolve => setTimeout(resolve, 2000));
                    continue;
                }

                // Get recent activities
                console.log('Fetching activities...');
                const activities = await axios.get(
                    `https://api-mainnet.magiceden.dev/v2/ord/btc/runes/activities/${runeSymbol}`,
                    {
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
                    marketInfo: marketInfo.data,
                    orders: orders.data,
                    activities: activities.data
                };

            } catch (error) {
                // Log the error but don't throw it
                console.log('Error fetching rune data:', {
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

    async createCall(channelId, callerUserId, runeSymbol) {
        try {
            console.log(`Creating rune call for symbol: ${runeSymbol}, channel: ${channelId}, caller: ${callerUserId}`);
            
            const runeData = await this.fetchRuneData(runeSymbol);
            if (!runeData || !runeData.marketInfo) {
                throw new Error('Could not fetch rune data');
            }

            console.log('Fetching caller info...');
            const caller = await this.client.users.fetch(callerUserId);
            console.log('Generating chart...');
            const chartBuffer = await this.generateChart(runeData);

            const attachment = new AttachmentBuilder(chartBuffer, { name: 'chart.png' });

            const floorPrice = runeData.orders?.length > 0 ? runeData.orders[0].unitPrice : 'N/A';
            const volume24h = runeData.marketInfo.volume24h || 0;
            const totalVolume = runeData.marketInfo.totalVolume || 0;

            console.log('Creating embed message...');
            const description = [
                `Called by: <@${callerUserId}>`,
                `**Initial Floor Price:** ${floorPrice} sats`,
                `**Current Floor Price:** ${floorPrice} sats`,
                `**24h Volume:** ${this.formatNumber(volume24h)} sats`,
                `**Total Volume:** ${this.formatNumber(totalVolume)} sats`,
                `**Listed Count:** ${runeData.orders?.length || 0}`,
                '',
                `**Rune Symbol:** ${runeSymbol}`,
                '',
                `**Magic Eden:** [View Rune](https://magiceden.io/ordinals/runes/${runeSymbol})`
            ].join('\n');

            const embed = new EmbedBuilder()
                .setColor('#00ff00')
                .setTitle(`🎯 New Rune Call: ${runeSymbol}`)
                .setDescription(description)
                .setImage('attachment://chart.png')
                .setTimestamp();

            console.log('Sending message to channel...');
            const channel = await this.client.channels.fetch(channelId);
            const message = await channel.send({ 
                content: `<@&${process.env.HOLDERS_ROLE_ID}> New rune call alert! 🚨`,
                embeds: [embed],
                files: [attachment]
            });
            console.log('Message sent successfully');

            // Store call data
            this.activeCalls.set(runeSymbol, {
                initialFloorPrice: floorPrice,
                messageId: message.id,
                channelId: channelId,
                symbol: runeSymbol,
                caller: caller.username,
                achievedMilestones: new Set(),
                lastUpdate: Date.now()
            });
            console.log('Call data stored successfully');

        } catch (error) {
            console.error('Error creating rune call:', {
                error: error.message,
                stack: error.stack,
                runeSymbol,
                channelId,
                callerUserId
            });
            throw error;
        }
    }

    async generateChart(runeData) {
        const activities = runeData.activities || [];
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
                    label: 'Price (sats)',
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
                            `Floor Price: ${runeData.orders?.[0]?.unitPrice || 'N/A'} sats`,
                            `24h Volume: ${this.formatNumber(runeData.marketInfo.volume24h || 0)} sats`
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
                                return value.toFixed(0) + ' sats';
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
        for (const [runeSymbol, callData] of this.activeCalls.entries()) {
            try {
                const runeData = await this.fetchRuneData(runeSymbol);
                if (!runeData || !runeData.orders || runeData.orders.length === 0) continue;

                const currentFloorPrice = runeData.orders[0].unitPrice;
                const multiplier = currentFloorPrice / callData.initialFloorPrice;

                // Check for new milestones
                for (const milestone of this.milestones) {
                    if (multiplier >= milestone && !callData.achievedMilestones.has(milestone)) {
                        await this.sendMilestoneAlert(runeSymbol, milestone, currentFloorPrice, callData);
                        callData.achievedMilestones.add(milestone);
                    }
                }
            } catch (error) {
                console.error(`Error checking rune call ${runeSymbol}:`, error);
            }
        }
    }

    async sendMilestoneAlert(runeSymbol, milestone, currentFloorPrice, callData) {
        if (!this.canSendAlert(runeSymbol)) return;

        const embed = new EmbedBuilder()
            .setColor('#00ff00')
            .setTitle(`🎯 ${runeSymbol} Hit ${milestone}x!`)
            .setDescription(
                `**Initial Floor:** ${callData.initialFloorPrice} sats\n` +
                `**Current Floor:** ${currentFloorPrice} sats\n` +
                `**Multiplier:** ${milestone}x 🚀\n\n` +
                `**Magic Eden:** [View Rune](https://magiceden.io/ordinals/runes/${runeSymbol})`
            )
            .setTimestamp();

        const channel = await this.client.channels.fetch(callData.channelId);
        await channel.send({
            content: `<@&${process.env.HOLDERS_ROLE_ID}> ${milestone}x milestone reached! 🎯`,
            embeds: [embed]
        });

        this.lastAlertTime.set(runeSymbol, Date.now());
    }

    canSendAlert(runeSymbol) {
        const lastAlert = this.lastAlertTime.get(runeSymbol) || 0;
        return Date.now() - lastAlert >= this.ALERT_COOLDOWN;
    }

    formatNumber(num) {
        return new Intl.NumberFormat('en-US', {
            maximumFractionDigits: 0
        }).format(num);
    }
}

module.exports = {
    createRuneCallTracker: function(client) {
        return new RuneCallTracker(client);
    }
}; 