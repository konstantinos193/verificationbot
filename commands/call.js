const { SlashCommandBuilder } = require('@discordjs/builders');
const TokenCallTracker = require('../systems/TokenCallTracker');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('call')
        .setDescription('Create a new token call')
        .addStringOption(option =>
            option.setName('address')
                .setDescription('Token contract address')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('chain')
                .setDescription('Chain (solana/ethereum)')
                .setRequired(true)
                .addChoices(
                    { name: 'Solana', value: 'solana' },
                    { name: 'Ethereum', value: 'ethereum' }
                )),

    async execute(interaction) {
        await interaction.deferReply();
        
        try {
            await TokenCallTracker.createCall(
                interaction.channelId,
                interaction.user.id,
                interaction.options.getString('address'),
                interaction.options.getString('chain')
            );

            await interaction.editReply('Call created successfully! 🎯');
        } catch (error) {
            await interaction.editReply(`Error creating call: ${error.message}`);
        }
    }
}; 