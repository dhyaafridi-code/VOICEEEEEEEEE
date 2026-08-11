require('dotenv').config();
const { Client, GatewayIntentBits } = require('discord.js');
const { joinVoiceChannel, entersState, VoiceConnectionStatus } = require('@discordjs/voice');
const express = require('express');

const app = express();
const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => {
    res.send('Bot is running!');
});

app.listen(PORT, () => {
    console.log(`Server is listening on port ${PORT}`);
});

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates] });

// ضع هنا آي دي القناة الصوتية الثابتة التي تريد أن يبقى فيها البوت طوال الوقت لتجميع الساعات
const TARGET_VOICE_CHANNEL_ID = 'ضع_آي_دي_القناة_الصوتية_هنا';
const TARGET_GUILD_ID = 'ضع_آي_دي_السيرفر_هنا';

let activeConnection = null;

async function keepConnected() {
    try {
        const guild = client.guilds.cache.get(TARGET_GUILD_ID);
        if (!guild) return;

        const connection = joinVoiceChannel({
            channelId: TARGET_VOICE_CHANNEL_ID,
            guildId: guild.id,
            adapterCreator: guild.voiceAdapterCreator,
            selfDeaf: true,
            selfMute: true
        });

        activeConnection = connection;

        // إعادة الاتصال فوراً في حال حدوث أي انقطاع
        connection.on(VoiceConnectionStatus.Disconnected, async () => {
            try {
                await Promise.race([
                    entersState(connection, VoiceConnectionStatus.Signalling, 5_000),
                    entersState(connection, VoiceConnectionStatus.Connecting, 5_000),
                ]);
            } catch (error) {
                connection.destroy();
                setTimeout(() => {
                    keepConnected();
                }, 2000);
            }
        });
    } catch (error) {
        console.log("خطأ في الاتصال الدائم:", error);
    }
}

client.once('ready', () => {
    console.log(`Logged in as ${client.user.tag}!`);
    // الاتصال بالقناة تلقائياً بمجرد تشغيل البوت
    setTimeout(() => {
        keepConnected();
    }, 3000);
});

client.login(process.env.DISCORD_TOKEN);
