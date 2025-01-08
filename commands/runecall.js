const { SlashCommandBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('runecall')
        .setDescription('Call a Bitcoin rune')
        .addStringOption(option =>
            option.setName('symbol')
                .setDescription('The rune symbol')
                .setRequired(true)),

    async execute(interaction) {
        try {
            await interaction.deferReply();

            const runeSymbol = interaction.options.getString('symbol');
            const channelId = interaction.channelId;
            const callerUserId = interaction.user.id;

            const runeCallTracker = interaction.client.runeCallTracker;
            await runeCallTracker.createCall(channelId, callerUserId, runeSymbol);

            await interaction.editReply('Rune call created! 🎯');
        } catch (error) {
            console.error('Error in runecall command:', error);
            await interaction.editReply('Failed to create rune call. Please check the rune symbol and try again.');
        }
    },
}; 