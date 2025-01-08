const axios = require('axios');
const { EmbedBuilder } = require('discord.js');
const { ChannelManager } = require('../ChannelManager');
const { BREAKOUT } = require('../../config/analysis');

class SolanaAnalyzer {
    constructor(client) {
        // Store Discord client
        this.client = client;
        if (!this.client) {
            console.error('Discord client not provided to SolanaAnalyzer');
            throw new Error('Discord client is required');
        }

        this.endpoints = {
            COINMARKETCAP: 'https://pro-api.coinmarketcap.com/v1/cryptocurrency',
            BIRDEYE: 'https://public-api.birdeye.so/public',
            SOLSCAN: 'https://public-api.solscan.io'
        };

        // Token IDs for CoinMarketCap
        this.tokenIds = {
            'SOL': '1027',
            'JTO': '17767',
            'BONK': '10478',
            'RAY': '5409',
            'DUST': '18189',
            'PYTH': '19880',
            'HNT': '10968'
        };

        // Top Solana tokens to track
        this.trackedTokens = Object.keys(this.tokenIds);
        this.timeframes = ['5m', '15m', '1h', '4h', '1d'];
        
        // API Keys
        this.CMC_API_KEY = process.env.CMC_API_KEY;
        if (!this.CMC_API_KEY) {
            console.error('CMC_API_KEY not found in environment variables');
            throw new Error('CMC_API_KEY is required');
        }

        // Configure axios defaults for CMC
        this.cmcAxios = axios.create({
            baseURL: this.endpoints.COINMARKETCAP,
            headers: {
                'X-CMC_PRO_API_KEY': this.CMC_API_KEY,
                'Accept': 'application/json',
                'Accept-Encoding': 'deflate, gzip'
            }
        });
        
        // Rate limiting
        this.lastRequestTime = 0;
        this.REQUEST_DELAY = 6000; // 6 seconds between requests
    }

    async delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    async startAnalysis() {
        // Run initial analysis
        await this.analyzeSolanaTokens();

        // Set up intervals for different timeframes
        setInterval(() => this.analyzeSolanaTokens(), 5 * 60 * 1000);  // 5 minutes
        setInterval(() => this.checkLargeTransactions(), 2 * 60 * 1000); // 2 minutes
        setInterval(() => this.analyzeMarketStructure(), 15 * 60 * 1000); // 15 minutes
    }

    async analyzeSolanaTokens() {
        try {
            for (const token of this.trackedTokens) {
                const data = await this.getTokenData(token);
                
                // Analyze price action
                const signals = await this.analyzeToken(data);
                
                if (signals.length > 0) {
                    await this.postSignals(signals, token, data); // Pass 'data' to post signals
                }
            }
        } catch (error) {
            console.error('Error analyzing Solana tokens:', error);
        }
    }

    async getTokenData(token) {
        try {
            // Rate limiting
            const now = Date.now();
            const timeSinceLastRequest = now - this.lastRequestTime;
            if (timeSinceLastRequest < this.REQUEST_DELAY) {
                await this.delay(this.REQUEST_DELAY - timeSinceLastRequest);
            }
            this.lastRequestTime = Date.now();

            const tokenId = this.tokenIds[token];
            if (!tokenId) {
                console.error(`No token ID found for ${token}`);
                return null;
            }

            // Get CoinMarketCap data
            const cmcData = await this.getCoinMarketCapData(token);
            return cmcData;

        } catch (error) {
            console.error(`Error fetching data for ${token}:`, error.message);
            return null;
        }
    }

    async getCoinMarketCapData(token) {
        try {
            const tokenId = this.tokenIds[token];

            const response = await this.cmcAxios.get('/quotes/latest', {
                params: {
                    id: tokenId,
                    convert: 'USD'
                }
            });

            const data = response.data.data[tokenId];
            if (!data) return null;

            return {
                price: data.quote.USD.price,
                volume24h: data.quote.USD.volume_24h,
                priceChange24h: data.quote.USD.percent_change_24h,
                marketCap: data.quote.USD.market_cap
            };
        } catch (error) {
            console.error(`Error fetching data for ${token} from CoinMarketCap:`, error.message);
            return null;
        }
    }

    async analyzeToken(data) {
        const signals = [];

        if (!data) return signals;

        // Volume breakout check
        if (data.volume24h > data.avgVolume * BREAKOUT.VOLUME_THRESHOLD) {
            signals.push({
                type: 'VOLUME_BREAKOUT',
                message: `Unusual volume detected: ${data.volume24h.toLocaleString()} (${Math.round((data.volume24h/data.avgVolume - 1) * 100)}% above average)`
            });
        }

        // Price breakout check
        if (Math.abs(data.priceChange24h) > BREAKOUT.PRICE_CHANGE_MIN * 100) {
            signals.push({
                type: 'PRICE_BREAKOUT',
                direction: data.priceChange24h > 0 ? 'BULLISH' : 'BEARISH',
                message: `Strong price movement: ${data.priceChange24h.toFixed(2)}% in 24h`
            });
        }

        return signals;
    }

    async postSignals(signals, token, data) {
        try {
            const channel = this.client.channels.cache.get(process.env.SOL_CALLS_CHANNEL_ID);
            if (!channel) {
                console.error('SOL_CALLS_CHANNEL_ID not found or invalid');
                return;
            }

            const embed = new EmbedBuilder()
                .setColor('#00ff00')
                .setTitle(`🚨 Solana Signal: ${token}`)
                .setDescription(signals.map(s => s.message).join('\n'))
                .addFields(
                    { name: 'Current Price', value: `$${data.price.toFixed(4)}`, inline: true },
                    { name: '24h Change', value: `${data.priceChange24h.toFixed(2)}%`, inline: true },
                    { name: '24h Volume', value: `$${data.volume24h.toLocaleString()}`, inline: true }
                )
                .setTimestamp();

            // Add signals to embed
            signals.forEach(signal => {
                embed.addField('Signal', signal);
            });

            await channel.send({ embeds: [embed] });
        } catch (error) {
            console.error('Error posting signals:', error);
        }
    }

    async checkLargeTransactions() {
        try {
            const response = await axios.get(`${this.endpoints.SOLSCAN}/transaction/last?limit=50`);
            const largeTransactions = response.data.filter(tx => 
                tx.lamport > 1000 * 1e9 // More than 1000 SOL
            );

            if (largeTransactions.length > 0) {
                await this.postLargeTransactions(largeTransactions);
            }
        } catch (error) {
            console.error('Error checking large transactions:', error);
        }
    }

    async postLargeTransactions(transactions) {
        try {
            const channel = this.client.channels.cache.get(process.env.SOL_CALLS_CHANNEL_ID);
            if (!channel) {
                console.error('SOL_CALLS_CHANNEL_ID not found or invalid');
                return;
            }

            const embed = new EmbedBuilder()
                .setColor('#0099ff')
                .setTitle('🐋 Large Solana Transactions Detected')
                .setDescription(transactions.map(tx => 
                    `Amount: ${(tx.lamport / 1e9).toFixed(2)} SOL\n` +
                    `[View Transaction](https://solscan.io/tx/${tx.txHash})`
                ).join('\n\n'))
                .setTimestamp();

            await channel.send({ embeds: [embed] });
        } catch (error) {
            console.error('Error posting large transactions:', error);
        }
    }
}

function createSolanaAnalyzer(client) {
    return new SolanaAnalyzer(client);
}

module.exports = { createSolanaAnalyzer };
