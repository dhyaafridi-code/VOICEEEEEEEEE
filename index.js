require('dotenv').config();
const { Client, GatewayIntentBits } = require('discord.js');
const { joinVoiceChannel, entersState, VoiceConnectionStatus } = require('@discordjs/voice');
const express = require('express');

// إعداد سيرفر وهمي لفتح بورت والاستجابة لـ Render
const app = express();
const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => {
    res.send('Bot is running!');
});

app.listen(PORT, () => {
    console.log(`Server is listening on port ${PORT}`);
});

// إعداد البوت
const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates] });
const MY_USER_ID = '851812052628275280';

// لتخزين آخر قناة صوتية دخلت إليها لتتمكن من العودة إليها عند الطرد
let lastChannelId = null;
let lastGuildId = null;
let activeConnection = null;

client.on('voiceStateUpdate', async (oldState, newState) => {
    // التحقق أن الحدث يخصك أنت
    if (newState.member.id === MY_USER_ID) {
        // إذا دخلت إلى أي قناة صوتية (سواء عادية أو مؤقتة)
        if (newState.channelId) {
            lastChannelId = newState.channelId;
            lastGuildId = newState.guild.id;

            // إذا لم يكن البوت متصلاً أو كان في قناة أخرى، قم بالدخول
            if (!activeConnection || activeConnection.joinConfig.channelId !== newState.channelId) {
                setTimeout(async () => {
                    await connectToChannel(newState.channelId, newState.guild);
                }, 500);
            }
        }
    }
});

// دالة الاتصال مع ميزة الثبات وإعادة الدخول التلقائي عند الطرد
async function connectToChannel(channelId, guild) {
    try {
        const connection = joinVoiceChannel({
            channelId: channelId,
            guildId: guild.id,
            adapterCreator: guild.voiceAdapterCreator,
            selfDeaf: true,
            selfMute: true
        });

        activeConnection = connection;

        // مراقبة حالة الاتصال وإعادة الاتصال إن انقطع
        connection.on(VoiceConnectionStatus.Disconnected, async () => {
            try {
                await Promise.race([
                    entersState(connection, VoiceConnectionStatus.Signalling, 5_000),
                    entersState(connection, VoiceConnectionStatus.Connecting, 5_000),
                ]);
            } catch (error) {
                // إذا تم طرد البوت أو قطع الاتصال كلياً، يعود تلقائياً لنفس القناة فوراً
                connection.destroy();
                activeConnection = null;
                if (lastChannelId && lastGuildId) {
                    const targetGuild = client.guilds.cache.get(lastGuildId);
                    if (targetGuild) {
                        setTimeout(() => {
                            connectToChannel(lastChannelId, targetGuild);
                        }, 1000);
                    }
                }
            }
        });

    } catch (error) {
        console.log("خطأ أثناء محاولة الانضمام للفويس:", error);
    }
}

client.once('ready', () => {
    console.log(`Logged in as ${client.user.tag}!`);
});

client.login(process.env.DISCORD_TOKEN);
