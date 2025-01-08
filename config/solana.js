module.exports = {
    // Token addresses for tracking
    TOKENS: {
        SOL: 'So11111111111111111111111111111111111111112',
        JTO: 'jtojtomepa8beP8AuQc6eXt5FriJwfFMwQx2v2f9mCL',
        BONK: 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263',
        RAY: '4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R',
        DUST: 'DUSTawucrTsGU8hcqRdHDCbuYhCPADMLM2VcCb8VnFnQ',
        PYTH: 'HZ1JovNiVvGrGNiiYvEozEVgZ58xaU3RKwX8eACQBCt3'
    },

    // Analysis parameters
    ANALYSIS: {
        VOLUME_MULTIPLIER: 3,        // Volume spike threshold
        PRICE_CHANGE_THRESHOLD: 5,   // Percentage for significant price movement
        LARGE_TX_THRESHOLD: 1000,    // SOL amount for large transaction alerts
        RSI_OVERBOUGHT: 70,
        RSI_OVERSOLD: 30,
        MA_PERIODS: [20, 50, 200]    // Moving average periods to track
    },

    // Technical indicators
    INDICATORS: {
        RSI_PERIOD: 14,
        MACD: {
            FAST: 12,
            SLOW: 26,
            SIGNAL: 9
        }
    }
}; 