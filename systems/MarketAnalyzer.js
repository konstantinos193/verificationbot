const { EmbedBuilder } = require('discord.js');
const axios = require('axios');

class MarketAnalyzer {
    constructor(client) {
        if (!client) throw new Error('Discord client is required');
        this.client = client;
        this.UPDATE_INTERVAL = 24 * 60 * 60 * 1000; // 24 hours in milliseconds
        this.ENDPOINTS = {
            CMC: 'https://pro-api.coinmarketcap.com/v1',
            BINANCE: 'https://api.binance.com/api/v3',
            BITMEX: 'https://www.bitmex.com/api/v1'
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

        // Start analysis
        this.startAnalysis();
    }

    async startAnalysis() {
        console.log('Starting market analysis system...');
        
        // Initial analysis
        await this.performAnalysis();
        
        // Set up periodic analysis
        setInterval(() => this.performAnalysis(), this.UPDATE_INTERVAL);
    }

    async performAnalysis() {
        try {
            console.log('Performing market analysis...');

            // Check API key first
            if (!this.CMC_API_KEY) {
                console.error('CMC_API_KEY not found in environment variables. Please add it to your .env file');
                return;
            }

            // Fetch market data
            const [btcData, globalData] = await Promise.all([
                this.getBTCData(),
                this.getGlobalData()
            ]);

            if (!btcData || !globalData) {
                console.error('Failed to fetch required market data. Please check your API key and rate limits.');
                return;
            }

            // Validate required data properties
            if (!btcData.quote?.USD || !globalData.quote?.USD) {
                console.error('Missing required USD quote data in API response');
                return;
            }

            // Prepare analysis data
            const analysisData = {
                btc: {
                    price: btcData.quote.USD.price || 0,
                    volume_24h: btcData.quote.USD.volume_24h || 0,
                    percent_change_24h: btcData.quote.USD.percent_change_24h || 0,
                    market_cap: btcData.quote.USD.market_cap || 0
                },
                global: {
                    total_market_cap: globalData.quote.USD.total_market_cap || 0,
                    btc_dominance: globalData.btc_dominance || 0,
                    total_volume_24h: globalData.quote.USD.total_volume_24h || 0,
                    market_cap_change: globalData.quote.USD.total_market_cap_yesterday_percentage_change || 0
                }
            };

            // Calculate market sentiment
            const sentiment = this.calculateSentiment(analysisData);

            // Prepare and send report
            await this.sendMarketReport({
                btc: analysisData.btc,
                global: analysisData.global,
                sentiment
            });

        } catch (error) {
            console.error('Error in market analysis:', error);
        }
    }

    async getFearGreedIndex() {
        const response = await axios.get(this.INDICATORS.FEAR_GREED);
        return response.data.data[0];
    }

    async getGlobalData() {
        try {
            const response = await this.cmcAxios.get('/global-metrics/quotes/latest', {
                params: {
                    convert: 'USD'
                }
            });

            // Check if we have a valid response with data
            if (!response.data || !response.data.data) {
                console.error('Invalid response format from CMC API:', response.data);
                return null;
            }

            const globalData = response.data.data;

            // Validate that we have the required quote data
            if (!globalData.quote || !globalData.quote.USD) {
                console.error('Missing USD quote data in CMC response:', globalData);
                return null;
            }

            return globalData;
        } catch (error) {
            if (error.response) {
                const status = error.response.status;
                const errorMsg = error.response.data?.status?.error_message || error.message;
                
                switch (status) {
                    case 429:
                        console.error('Rate limit exceeded:', errorMsg);
                        await this.delay(this.REQUEST_DELAY);
                        return this.getGlobalData(); // Retry
                    case 401:
                        console.error('Invalid or missing API Key. Please check your CMC_API_KEY in .env file');
                        return null;
                    default:
                        console.error(`CMC API Error (${status}):`, errorMsg);
                }
            } else {
                console.error('Error fetching global data:', error.message);
            }
            return null;
        }
    }

    async getFundingRates(coin) {
        const response = await axios.get(this.INDICATORS.BTC_FUNDING);
        return response.data
            .filter(rate => rate.symbol.includes(coin))
            .map(rate => ({
                exchange: rate.exchange,
                rate: rate.funding_rate
            }));
    }

    calculateSentiment(data) {
        let score = 0;
        let signals = [];

        // BTC Price Change Analysis
        if (data.btc.percent_change_24h > 5) {
            score += 2;
            signals.push('🟢 Strong BTC price increase in 24h');
        } else if (data.btc.percent_change_24h < -5) {
            score -= 2;
            signals.push('🔴 Significant BTC price decrease in 24h');
        }

        // Volume Analysis
        const avgDailyVolume = data.btc.volume_24h;
        if (avgDailyVolume > data.btc.market_cap * 0.1) {
            score += 1;
            signals.push('🟢 High trading volume relative to market cap');
        }

        // Market Cap Analysis
        if (data.global.market_cap_change > 5) {
            score += 1;
            signals.push('🟢 Overall market cap increasing');
        } else if (data.global.market_cap_change < -5) {
            score -= 1;
            signals.push('🔴 Overall market cap decreasing');
        }

        // BTC Dominance analysis
        if (data.global.btc_dominance > 50) {
            score += 1;
            signals.push('🟢 High BTC Dominance - BTC strength');
        } else if (data.global.btc_dominance < 40) {
            score -= 1;
            signals.push('🔴 Low BTC Dominance - Alt season potential');
        }

        return {
            score,
            signals,
            overall: score > 1 ? 'Bullish' : score < -1 ? 'Bearish' : 'Neutral'
        };
    }

    async sendMarketReport(data) {
        const channel = await this.client.channels.fetch(process.env.MACRO_ANALYSIS_CHANNEL_ID);
        if (!channel) return;

        const embed = new EmbedBuilder()
            .setTitle('🔍 Market Analysis Report')
            .setColor(data.sentiment.score > 1 ? '#00ff00' : data.sentiment.score < -1 ? '#ff0000' : '#ffff00')
            .addFields([
                {
                    name: '💰 Bitcoin Price',
                    value: `$${this.formatNumber(data.btc.price)} (${data.btc.percent_change_24h.toFixed(2)}% 24h)`,
                    inline: true
                },
                {
                    name: '🔶 BTC Dominance',
                    value: `${data.global.btc_dominance.toFixed(2)}%`,
                    inline: true
                },
                {
                    name: '📊 Total Market Cap',
                    value: `$${this.formatNumber(data.global.total_market_cap)} (${data.global.market_cap_change.toFixed(2)}% 24h)`,
                    inline: true
                },
                {
                    name: '📈 24h Volume',
                    value: `$${this.formatNumber(data.global.total_volume_24h)}`,
                    inline: true
                },
                {
                    name: '📝 Market Signals',
                    value: data.sentiment.signals.join('\n') || 'No significant signals',
                    inline: false
                },
                {
                    name: '🎯 Overall Sentiment',
                    value: `${data.sentiment.overall} (Score: ${data.sentiment.score})`,
                    inline: false
                }
            ])
            .setTimestamp()
            .setFooter({ 
                text: 'Ape Elite Club • Market Analysis',
                iconURL: 'https://i.imgur.com/QABnvka.jpeg'
            });

        await channel.send({ embeds: [embed] });
    }

    formatNumber(num) {
        return new Intl.NumberFormat('en-US', {
            notation: 'compact',
            maximumFractionDigits: 2
        }).format(num);
    }

    formatFunding(rates) {
        const avg = rates.reduce((acc, curr) => acc + curr.rate, 0) / rates.length;
        return `${(avg * 100).toFixed(4)}%`;
    }

    async getBTCData() {
        try {
            const response = await this.cmcAxios.get('/cryptocurrency/quotes/latest', {
                params: {
                    symbol: 'BTC',
                    convert: 'USD'
                }
            });

            // Check if we have a valid response with data
            if (!response.data || !response.data.data || !response.data.data.BTC) {
                console.error('Invalid response format from CMC API:', response.data);
                return null;
            }

            const btcData = response.data.data.BTC;
            
            // Validate that we have the required quote data
            if (!btcData.quote || !btcData.quote.USD) {
                console.error('Missing USD quote data in CMC response:', btcData);
                return null;
            }

            return btcData;
        } catch (error) {
            if (error.response) {
                const status = error.response.status;
                const errorMsg = error.response.data?.status?.error_message || error.message;
                
                switch (status) {
                    case 429:
                        console.error('Rate limit exceeded:', errorMsg);
                        await this.delay(this.REQUEST_DELAY);
                        return this.getBTCData(); // Retry
                    case 401:
                        console.error('Invalid or missing API Key. Please check your CMC_API_KEY in .env file');
                        return null;
                    default:
                        console.error(`CMC API Error (${status}):`, errorMsg);
                }
            } else {
                console.error('Error fetching BTC data:', error.message);
            }
            return null;
        }
    }
}

function createMarketAnalyzer(client) {
    return new MarketAnalyzer(client);
}

module.exports = { createMarketAnalyzer }; 