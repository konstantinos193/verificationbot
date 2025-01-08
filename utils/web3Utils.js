const { Web3 } = require('web3');
const { ethers } = require('ethers');

// ApeChain RPC configuration
const APECHAIN_RPC = 'https://apechain.calderachain.xyz/http';
const NFT_CONTRACT = '0x485242262f1e367144fe432ba858f9ef6f491334';
const STAKING_CONTRACT = '0xddbcc239527dedd5e0c761042ef02a7951cec315';

// Minimal ABI for checking NFT balance
const NFT_ABI = [
    'function balanceOf(address owner) view returns (uint256)',
    'function tokenOfOwnerByIndex(address owner, uint256 index) view returns (uint256)'
];

// Minimal ABI for staking contract
const STAKING_ABI = [
    'function getStakerInfo(address _staker) view returns (uint256[], uint256, uint256, bool)'
];

class Web3Utils {
    constructor() {
        this.web3 = new Web3(APECHAIN_RPC);
        this.provider = new ethers.JsonRpcProvider(APECHAIN_RPC);
        this.nftContract = new ethers.Contract(NFT_CONTRACT, NFT_ABI, this.provider);
        this.stakingContract = new ethers.Contract(STAKING_CONTRACT, STAKING_ABI, this.provider);
    }

    async verifyHolder(address) {
        try {
            // Check direct holdings
            const balance = await this.nftContract.balanceOf(address);
            
            // Check staked NFTs
            const stakerInfo = await this.stakingContract.getStakerInfo(address);
            const stakedTokens = stakerInfo[0];

            const totalHoldings = Number(balance) + stakedTokens.length;
            
            return {
                isHolder: totalHoldings > 0,
                directHoldings: Number(balance),
                stakedHoldings: stakedTokens.length,
                totalHoldings: totalHoldings
            };
        } catch (error) {
            console.error('Verification error:', error);
            return {
                isHolder: false,
                error: 'Verification failed'
            };
        }
    }
}

module.exports = new Web3Utils(); 