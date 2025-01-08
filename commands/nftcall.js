const { SlashCommandBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('nftcall')
        .setDescription('Call a Solana NFT collection')
        .addStringOption(option =>
            option.setName('collection')
                .setDescription('The Magic Eden collection symbol (from URL)')
                .setRequired(true)),

    async execute(interaction) {
        try {
            await interaction.deferReply();

            const collectionSymbol = interaction.options.getString('collection');
            const channelId = interaction.channelId;
            const callerUserId = interaction.user.id;

            const nftCallTracker = interaction.client.nftCallTracker;
            await nftCallTracker.createCall(channelId, callerUserId, collectionSymbol);

            await interaction.editReply('NFT call created! 🎯');
        } catch (error) {
            console.error('Error in nftcall command:', error);
            await interaction.editReply('Failed to create NFT call. Please check the collection symbol and try again.');
        }
    },
}; 