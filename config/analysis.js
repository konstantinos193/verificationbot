module.exports = {
    BREAKOUT: {
        VOLUME_THRESHOLD: 2.5,      // Volume spike threshold (multiplier)
        PRICE_CHANGE_MIN: 0.03,     // Minimum price change (3%)
        TIME_WINDOW: 24,            // Hours to analyze
    },
    
    WHALE: {
        MINIMUM_VALUE: 100000,      // Minimum USD value for whale alerts
        TRACKED_TOKENS: [
            'ETH', 'BTC', 'SOL', 'APE'
        ]
    },
    
    SENTIMENT: {
        UPDATE_FREQUENCY: 4,        // Hours between updates
        INDICATORS: [
            'fear_greed_index',
            'social_volume',
            'dev_activity'
        ]
    }
}; 