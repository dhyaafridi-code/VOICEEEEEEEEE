require('dotenv').config();
const { Client, GatewayIntentBits } = require('discord.js');
const { joinVoiceChannel } = require('@discordjs/voice');
const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates] });

const MY_USER_ID = '851812052628275280';

client.on('voiceStateUpdate', (oldState, newState) => {
    if (newState.member.id === MY_USER_ID && newState.channelId) {
        setTimeout(() => {
            joinVoiceChannel({
                channelId: newState.channelId,
                guildId: newState.guild.id,
                adapterCreator: newState.guild.voiceAdapterCreator,
                selfDeaf: true,
                selfMute: true
            });
        }, 500);
    }
});

client.login(process.env.DISCORD_TOKEN);