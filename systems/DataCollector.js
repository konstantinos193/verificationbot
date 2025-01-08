const { EmbedBuilder } = require('discord.js');
const axios = require('axios');

class DataCollector {
    constructor() {
        this.apis = {
            // Price and Market Data
            CMC: 'https://pro-api.coinmarketcap.com/v1',
            BINANCE: 'https://api.binance.com/api/v3',
            
            // NFT Data
            OPENSEA: 'https://api.opensea.io/api/v1',
            MAGICEDEN: 'https://api-mainnet.magiceden.dev/v2',
            
            // On-chain Data
            ETHERSCAN: `https://api.etherscan.io/api`,
            SOLSCAN: 'https://public-api.solscan.io',
            
            // Whale Tracking
            WHALE_ALERT: 'https://api.whale-alert.io/v1',
            
            // Market Sentiment
            FEAR_GREED: 'https://api.alternative.me/fng'
        };

        this.intervals = {
            PRICE_UPDATE: 5 * 60 * 1000,      // 5 minutes
            WHALE_ALERTS: 10 * 60 * 1000,     // 10 minutes
            MARKET_SENTIMENT: 60 * 60 * 1000,  // 1 hour
            NFT_TRENDS: 30 * 60 * 1000        // 30 minutes
        };

        // API Keys
        this.CMC_API_KEY = process.env.CMC_API_KEY;
        if (!this.CMC_API_KEY) {
            console.error('CMC_API_KEY not found in environment variables');
            throw new Error('CMC_API_KEY is required');
        }

        // Configure axios defaults for CMC
        this.cmcAxios = axios.create({
            baseURL: this.apis.CMC,
            headers: {
                'X-CMC_PRO_API_KEY': this.CMC_API_KEY,
                'Accept': 'application/json',
                'Accept-Encoding': 'deflate, gzip'
            }
        });
    }

    async startDataCollection() {
        // Start all collection processes
        this.collectPriceData();
        this.trackWhaleMovements();
        this.analyzeMarketSentiment();
        this.trackNFTTrends();
    }

    async collectPriceData() {
        setInterval(async () => {
            try {
                const [btcData, ethData] = await Promise.all([
                    this.fetchCryptoPrice('BTC'),
                    this.fetchCryptoPrice('ETH')
                ]);

                if (btcData && ethData) {
                    await this.processPriceData({ btc: btcData, eth: ethData });
                }
            } catch (error) {
                console.error('Error collecting price data:', error);
            }
        }, this.intervals.PRICE_UPDATE);
    }

    async fetchCryptoPrice(symbol) {
        try {
            const response = await this.cmcAxios.get('/cryptocurrency/quotes/latest', {
                params: {
                    symbol,
                    convert: 'USD'
                }
            });

            if (!response.data?.data?.[symbol]?.quote?.USD) {
                console.error(`Invalid response format for ${symbol}:`, response.data);
                return null;
            }

            const data = response.data.data[symbol];
            return {
                price: data.quote.USD.price,
                change_24h: data.quote.USD.percent_change_24h,
                volume_24h: data.quote.USD.volume_24h,
                market_cap: data.quote.USD.market_cap
            };
        } catch (error) {
            console.error(`Error fetching ${symbol} price:`, error.message);
            return null;
        }
    }

    async trackWhaleMovements() {
        setInterval(async () => {
            try {
                const movements = await this.fetchWhaleAlerts();
                if (movements.length > 0) {
                    await this.postWhaleAlert(movements);
                }
            } catch (error) {
                console.error('Error tracking whale movements:', error);
            }
        }, this.intervals.WHALE_ALERTS);
    }

    async analyzeMarketSentiment() {
        setInterval(async () => {
            try {
                // Get Fear & Greed Index
                const fearGreedResponse = await axios.get(this.apis.FEAR_GREED);
                const fearGreedIndex = fearGreedResponse.data.data[0];

                // Get market data from CMC
                const [btcData, ethData] = await Promise.all([
                    this.fetchCryptoPrice('BTC'),
                    this.fetchCryptoPrice('ETH')
                ]);

                if (!btcData || !ethData) {
                    console.error('Failed to fetch crypto price data');
                    return;
                }

                const sentiment = {
                    fearGreed: {
                        value: fearGreedIndex.value,
                        classification: fearGreedIndex.value_classification
                    },
                    btc: {
                        price: btcData.price,
                        change_24h: btcData.change_24h,
                        volume_24h: btcData.volume_24h
                    },
                    eth: {
                        price: ethData.price,
                        change_24h: ethData.change_24h,
                        volume_24h: ethData.volume_24h
                    }
                };

                await this.postMarketSentiment(sentiment);
            } catch (error) {
                console.error('Error analyzing market sentiment:', error);
            }
        }, this.intervals.MARKET_SENTIMENT);
    }

    // Helper methods for data analysis
    analyzeBreakouts(data, chain) {
        // Implement technical analysis here
        const breakouts = this.detectBreakoutPatterns(data);
        if (breakouts.length > 0) {
            this.postBreakoutSignal(breakouts, chain);
        }
    }

    detectBreakoutPatterns(data) {
        // Implement breakout detection logic
        // Example: Moving average crossovers, volume spikes, etc.
        return [];
    }

    // Posting methods
    async postBreakoutSignal(breakouts, chain) {
        const embed = new EmbedBuilder()
            .setColor('#ff0000')
            .setTitle(`🚨 Breakout Alert: ${chain}`)
            .setDescription(breakouts.map(b => 
                `**${b.asset}** showing breakout pattern\n` +
                `Price: ${b.price}\n` +
                `Volume: ${b.volume}\n` +
                `Pattern: ${b.pattern}`
            ).join('\n\n'))
            .setTimestamp();

        // Post to appropriate channel using ChannelManager
    }
}

module.exports = new DataCollector(); 