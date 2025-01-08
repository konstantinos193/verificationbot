module.exports = {
    // Point System Configuration
    POINTS: {
        SUCCESSFUL_CALL: 10,
        PARTIAL_SUCCESS: 5,
        FAILED_CALL: 0,
        RESEARCH_CONTRIBUTION: 20
    },
    
    // Role Configuration
    ROLES: {
        COMMUNITY_CALLER: {
            name: 'Community Caller',
            requiredPoints: 100
        },
        ALPHA_CALLER: {
            name: 'Alpha Caller',
            requiredPoints: 500
        }
    },

    // Supported Chains
    CHAINS: {
        APECHAIN: 'ApeChain',
        SOLANA: 'Solana',
        ETHEREUM: 'Ethereum',
        BTC: 'Bitcoin Ecosystem'
    }
}; 