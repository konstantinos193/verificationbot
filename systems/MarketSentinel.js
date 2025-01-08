const { EmbedBuilder } = require('discord.js');
const axios = require('axios');

class MarketSentinel {
    constructor(client) {
        if (!client) throw new Error('Discord client is required');
        this.client = client;
        this.SENTIMENT_CHANNEL_ID = process.env.MARKET_SENTIMENT_CHANNEL_ID;
        this.UPDATE_INTERVAL = 24 * 60 * 60 * 1000; // 24 hours in milliseconds
        this.ENDPOINTS = {
            CMC: 'https://pro-api.coinmarketcap.com/v1',
            BINANCE: 'https://api.binance.com/api/v3',
            BINANCE_FUTURES: 'https://fapi.binance.com/fapi/v1',
            BITMEX: 'https://www.bitmex.com/api/v1',
            COINGECKO: {
                BTC: 'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd&include_24hr_change=true',
                ETH: 'https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd&include_24hr_change=true'
            }
        };

        // Store last state to compare changes
        this.lastState = {
            btcPrice: null,
            ethPrice: null,
            sentiment: 'Neutral',
            strength: 0
        };

        // Thresholds for significant changes
        this.THRESHOLDS = {
            PRICE_CHANGE: 2.0,     // 2% price change
            STRENGTH_CHANGE: 2,     // 2 point sentiment strength change
            WALL_MIN: 100,         // Minimum wall size in BTC to report
            PREMIUM_THRESHOLD: 0.5  // 0.5% futures premium threshold
        };

        // API Keys
        this.CMC_API_KEY = process.env.CMC_API_KEY;
        if (!this.CMC_API_KEY) {
            console.error('CMC_API_KEY not found in environment variables');
            throw new Error('CMC_API_KEY is required');
        }

        // Configure axios defaults for CMC
        this.cmcAxios = axios.create({
            baseURL: this.ENDPOINTS.CMC,
            headers: {
                'X-CMC_PRO_API_KEY': this.CMC_API_KEY,
                'Accept': 'application/json',
                'Accept-Encoding': 'deflate, gzip'
            }
        });

        // Rate limiting
        this.lastRequestTime = 0;
        this.REQUEST_DELAY = 6000; // 6 seconds between requests

        // Start the sentinel
        this.startSentinel();
    }

    async delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    async startSentinel() {
        console.log('Starting market sentiment monitoring...');
        
        // Initial analysis
        await this.performSentimentAnalysis();
        
        // Set up periodic analysis
        setInterval(() => this.performSentimentAnalysis(), this.UPDATE_INTERVAL);
    }

    async performSentimentAnalysis() {
        try {
            console.log('Analyzing market sentiment...');

            // Fetch market data
            const [btcPrice, ethPrice, orderBook, futures, liquidations, openInterest] = await Promise.all([
                this.getBTCPrice(),
                this.getETHPrice(),
                this.getOrderBook(),
                this.getFuturesData(),
                this.getLiquidations(),
                this.getOpenInterest()
            ]);

            if (!btcPrice || !ethPrice) {
                console.error('Failed to fetch price data. Please check your API key and rate limits.');
                return;
            }

            // Analyze market structure
            const marketStructure = this.analyzeMarketStructure({
                btcPrice,
                ethPrice,
                orderBook,
                futures,
                liquidations,
                openInterest
            });

            // Check if changes are significant enough to post
            if (this.shouldPostUpdate(btcPrice, ethPrice, marketStructure)) {
                // Generate and send report
                await this.sendSentimentReport({
                    btcPrice,
                    ethPrice,
                    marketStructure,
                    liquidations,
                    openInterest
                });

                // Update last state
                this.lastState = {
                    btcPrice,
                    ethPrice,
                    sentiment: marketStructure.sentiment,
                    strength: marketStructure.strength
                };
            }

        } catch (error) {
            console.error('Error in sentiment analysis:', error);
        }
    }

    shouldPostUpdate(btcPrice, ethPrice, marketStructure) {
        if (!this.lastState.btcPrice) return true; // First run

        // Check for significant price changes
        const btcPriceChange = Math.abs(btcPrice.usd_24h_change - this.lastState.btcPrice.usd_24h_change);
        const ethPriceChange = Math.abs(ethPrice.usd_24h_change - this.lastState.ethPrice.usd_24h_change);
        
        // Check for sentiment strength changes
        const strengthChange = Math.abs(marketStructure.strength - this.lastState.strength);

        return (
            btcPriceChange >= this.THRESHOLDS.PRICE_CHANGE ||
            ethPriceChange >= this.THRESHOLDS.PRICE_CHANGE ||
            strengthChange >= this.THRESHOLDS.STRENGTH_CHANGE ||
            marketStructure.sentiment !== this.lastState.sentiment
        );
    }

    async getBTCPrice() {
        try {
            // Try CoinGecko first
            const cgResponse = await axios.get(this.ENDPOINTS.COINGECKO.BTC);
            if (cgResponse.data?.bitcoin) {
                return {
                    usd: cgResponse.data.bitcoin.usd,
                    usd_24h_change: cgResponse.data.bitcoin.usd_24h_change
                };
            }
        } catch (error) {
            console.error('Error fetching BTC price from CoinGecko:', error.message);
        }

        // Fallback to CMC
        try {
            const response = await this.cmcAxios.get('/cryptocurrency/quotes/latest', {
                params: {
                    symbol: 'BTC',
                    convert: 'USD'
                }
            });

            if (!response.data?.data?.BTC?.quote?.USD) {
                console.error('Invalid response format from CMC API:', response.data);
                return null;
            }

            const btcData = response.data.data.BTC;
            return {
                usd: btcData.quote.USD.price,
                usd_24h_change: btcData.quote.USD.percent_change_24h
            };
        } catch (error) {
            console.error('Error fetching BTC price from CMC:', error.message);
            return null;
        }
    }

    async getETHPrice() {
        try {
            // Try CoinGecko first
            const cgResponse = await axios.get(this.ENDPOINTS.COINGECKO.ETH);
            if (cgResponse.data?.ethereum) {
                return {
                    usd: cgResponse.data.ethereum.usd,
                    usd_24h_change: cgResponse.data.ethereum.usd_24h_change
                };
            }
        } catch (error) {
            console.error('Error fetching ETH price from CoinGecko:', error.message);
        }

        // Fallback to CMC
        try {
            const response = await this.cmcAxios.get('/cryptocurrency/quotes/latest', {
                params: {
                    symbol: 'ETH',
                    convert: 'USD'
                }
            });

            if (!response.data?.data?.ETH?.quote?.USD) {
                console.error('Invalid response format from CMC API:', response.data);
                return null;
            }

            const ethData = response.data.data.ETH;
            return {
                usd: ethData.quote.USD.price,
                usd_24h_change: ethData.quote.USD.percent_change_24h
            };
        } catch (error) {
            console.error('Error fetching ETH price from CMC:', error.message);
            return null;
        }
    }

    async getOrderBook() {
        try {
            const response = await axios.get(`${this.ENDPOINTS.BINANCE}/depth`, {
                params: { 
                    symbol: 'BTCUSDT',
                    limit: 500
                }
            });
            return response.data;
        } catch (error) {
            console.error('Error fetching order book:', error.message);
            return { bids: [], asks: [] };
        }
    }

    async getFuturesData() {
        try {
            const response = await axios.get(`${this.ENDPOINTS.BINANCE_FUTURES}/premiumIndex`, {
                params: { symbol: 'BTCUSDT' }
            });
            return response.data;
        } catch (error) {
            console.error('Error fetching futures data:', error.message);
            return null;
        }
    }

    async getLiquidations() {
        try {
            const response = await axios.get(`${this.ENDPOINTS.BITMEX}/liquidation`, {
                params: {
                    symbol: 'XBTUSD',  // BTC-USD perpetual
                    count: 100,
                    reverse: true
                }
            });

            const liquidations = response.data.map(liq => ({
                side: liq.side.toLowerCase(),
                volume: liq.leavesQty / 100000000, // Convert satoshis to BTC
                price: liq.price
            }));

            return liquidations;
        } catch (error) {
            console.error('Error fetching liquidations:', error.message);
            return [];
        }
    }

    async getOpenInterest() {
        try {
            const response = await axios.get(`${this.ENDPOINTS.BITMEX}/instrument`, {
                params: {
                    symbol: 'XBTUSD',
                    columns: ['openInterest', 'timestamp']
                }
            });

            const data = response.data;
            return [data.openInterest];
        } catch (error) {
            console.error('Error fetching open interest:', error.message);
            return [0];
        }
    }

    analyzeMarketStructure(data) {
        let signals = [];
        let strength = 0;

        // Analyze order book imbalances
        const buyWall = this.findLargestWalls(data.orderBook.bids);
        const sellWall = this.findLargestWalls(data.orderBook.asks);
        
        if (buyWall.size > this.THRESHOLDS.WALL_MIN && buyWall.size > sellWall.size * 1.5) {
            strength += 1;
            signals.push(`🟢 Strong buy wall at $${buyWall.price} (${this.formatNumber(buyWall.size)} BTC)`);
        } else if (sellWall.size > this.THRESHOLDS.WALL_MIN && sellWall.size > buyWall.size * 1.5) {
            strength -= 1;
            signals.push(`🔴 Strong sell wall at $${sellWall.price} (${this.formatNumber(sellWall.size)} BTC)`);
        }

        // Analyze liquidations
        const longLiqs = data.liquidations.filter(l => l.side === 'long').reduce((acc, l) => acc + l.volume, 0);
        const shortLiqs = data.liquidations.filter(l => l.side === 'short').reduce((acc, l) => acc + l.volume, 0);
        
        if (longLiqs > shortLiqs * 2) {
            strength -= 1;
            signals.push(`🔴 Heavy long liquidations (${this.formatNumber(longLiqs)} BTC)`);
        } else if (shortLiqs > longLiqs * 2) {
            strength += 1;
            signals.push(`🟢 Heavy short liquidations (${this.formatNumber(shortLiqs)} BTC)`);
        }

        // Analyze open interest changes
        if (data.openInterest && data.openInterest.length > 1) {
            const oiChange = data.openInterest[data.openInterest.length - 1] - data.openInterest[0];
            if (Math.abs(oiChange) > data.openInterest[0] * 0.05) {
                if (oiChange > 0) {
                    strength += 1;
                    signals.push('🟢 Significant increase in Open Interest');
                } else {
                    strength -= 1;
                    signals.push('🔴 Significant decrease in Open Interest');
                }
            }
        }

        // Analyze price action
        if (data.btcPrice && data.btcPrice.usd_24h_change > 5) {
            strength += 1;
            signals.push(`🟢 Strong BTC momentum (+${data.btcPrice.usd_24h_change.toFixed(2)}% 24h)`);
        } else if (data.btcPrice && data.btcPrice.usd_24h_change < -5) {
            strength -= 1;
            signals.push(`🔴 Weak BTC momentum (${data.btcPrice.usd_24h_change.toFixed(2)}% 24h)`);
        }

        // Analyze ETH relative strength
        if (data.ethPrice && data.btcPrice) {
            const ethOutperformance = data.ethPrice.usd_24h_change - data.btcPrice.usd_24h_change;
            if (ethOutperformance > 3) {
                strength += 1;
                signals.push(`🟢 ETH outperforming BTC (+${ethOutperformance.toFixed(2)}%)`);
            } else if (ethOutperformance < -3) {
                strength -= 1;
                signals.push(`🔴 ETH underperforming BTC (${ethOutperformance.toFixed(2)}%)`);
            }
        }

        // Analyze futures premium
        if (data.futures && data.btcPrice) {
            const premium = ((data.futures.markPrice / data.btcPrice.usd) - 1) * 100;
            if (premium > this.THRESHOLDS.PREMIUM_THRESHOLD) {
                strength += 1;
                signals.push(`🟢 High futures premium (${premium.toFixed(2)}%)`);
            } else if (premium < -this.THRESHOLDS.PREMIUM_THRESHOLD) {
                strength -= 1;
                signals.push(`🔴 Futures discount (${premium.toFixed(2)}%)`);
            }
        }

        return {
            signals,
            strength,
            sentiment: strength > 1 ? 'Bullish' : strength < -1 ? 'Bearish' : 'Neutral'
        };
    }

    findLargestWalls(orders) {
        let maxWall = { price: 0, size: 0 };
        for (const [price, size] of orders) {
            const sizeNum = parseFloat(size);
            if (sizeNum > maxWall.size) {
                maxWall = { price: parseFloat(price), size: sizeNum };
            }
        }
        return maxWall;
    }

    async sendSentimentReport(data) {
        try {
            const channel = await this.client.channels.fetch(this.SENTIMENT_CHANNEL_ID);
            if (!channel) {
                console.error('Market sentiment channel not found');
                return;
            }

            const embed = new EmbedBuilder()
                .setTitle('📊 Market Sentiment Analysis')
                .setColor(data.marketStructure.strength > 1 ? '#00ff00' : data.marketStructure.strength < -1 ? '#ff0000' : '#ffff00')
                .addFields([
                    {
                        name: '💰 BTC Price',
                        value: `$${this.formatNumber(data.btcPrice.usd)} (${data.btcPrice.usd_24h_change.toFixed(2)}% 24h)`,
                        inline: true
                    },
                    {
                        name: '💎 ETH Price',
                        value: `$${this.formatNumber(data.ethPrice.usd)} (${data.ethPrice.usd_24h_change.toFixed(2)}% 24h)`,
                        inline: true
                    },
                    {
                        name: '📈 Open Interest',
                        value: data.openInterest && data.openInterest.length > 0 
                            ? `$${this.formatNumber(data.openInterest[data.openInterest.length - 1])}` 
                            : 'Data unavailable',
                        inline: true
                    },
                    {
                        name: '💥 Recent Liquidations',
                        value: this.formatLiquidations(data.liquidations),
                        inline: false
                    },
                    {
                        name: '🔍 Market Signals',
                        value: data.marketStructure.signals.join('\n') || 'No significant signals',
                        inline: false
                    },
                    {
                        name: '🎯 Current Sentiment',
                        value: `${data.marketStructure.sentiment} (Strength: ${data.marketStructure.strength})`,
                        inline: false
                    }
                ])
                .setTimestamp()
                .setFooter({ 
                    text: 'Ape Elite Club • Market Sentiment',
                    iconURL: 'https://i.imgur.com/QABnvka.jpeg'
                });

            await channel.send({ embeds: [embed] });
        } catch (error) {
            console.error('Error sending sentiment report:', error);
        }
    }

    formatNumber(num) {
        if (!num) return '0';
        return new Intl.NumberFormat('en-US', {
            maximumFractionDigits: 2
        }).format(num);
    }

    formatLiquidations(liqs) {
        if (!liqs || liqs.length === 0) return 'No significant liquidations';

        const longLiqs = liqs.filter(l => l.side === 'long').reduce((acc, l) => acc + l.volume, 0);
        const shortLiqs = liqs.filter(l => l.side === 'short').reduce((acc, l) => acc + l.volume, 0);

        if (longLiqs === 0 && shortLiqs === 0) return 'No significant liquidations';

        return `Longs: ${this.formatNumber(longLiqs)} BTC\nShorts: ${this.formatNumber(shortLiqs)} BTC`;
    }
}

function createMarketSentinel(client) {
    return new MarketSentinel(client);
}

module.exports = { createMarketSentinel };
