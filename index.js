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

// لتخزين القناة الحالية التي يتواجد فيها البوت معك
let activeConnection = null;
let currentChannelId = null;

client.on('voiceStateUpdate', async (oldState, newState) => {
    // التحقق إذا كان الحدث يخصك أنت (حسابك الشخصي)
    if (newState.member.id === MY_USER_ID || oldState.member.id === MY_USER_ID) {
        
        // الحالة الأولى: إذا دخلت إلى قناة صوتية أو انتقلت إليها
        if (newState.member.id === MY_USER_ID && newState.channelId) {
            currentChannelId = newState.channelId;
            if (!activeConnection || activeConnection.joinConfig.channelId !== newState.channelId) {
                setTimeout(async () => {
                    await connectToChannel(newState.channelId, newState.guild);
                }, 500);
            }
        } 
        
        // الحالة الثانية: إذا خرجت تماماً من الفويس (ولم تقم بالانتقال لقناة أخرى)
        if (oldState.member.id === MY_USER_ID && oldState.channelId && !newState.channelId) {
            if (activeConnection) {
                activeConnection.destroy();
                activeConnection = null;
                currentChannelId = null;
            }
        }
    }
});

// دالة الاتصال بالقناة
async function connectToChannel(channelId, guild) {
    try {
        // إذا كان هناك اتصال قديم، قم بقطعه أولاً
        if (activeConnection) {
            activeConnection.destroy();
        }

        const connection = joinVoiceChannel({
            channelId: channelId,
            guildId: guild.id,
            adapterCreator: guild.voiceAdapterCreator,
            selfDeaf: true,
            selfMute: true
        });

        activeConnection = connection;

        // مراقبة حالة الاتصال وإعادة الاتصال إن انقطعت لأسباب تقنية (وليس لأنك خرجت)
        connection.on(VoiceConnectionStatus.Disconnected, async () => {
            try {
                await Promise.race([
                    entersState(connection, VoiceConnectionStatus.Signalling, 5_000),
                    entersState(connection, VoiceConnectionStatus.Connecting, 5_000),
                ]);
            } catch (error) {
                connection.destroy();
                activeConnection = null;
                // يعود فقط إذا كنت لم تخرج أنت أصلاً من القناة
                if (currentChannelId) {
                    const targetGuild = client.guilds.cache.get(guild.id);
                    if (targetGuild) {
                        setTimeout(() => {
                            connectToChannel(currentChannelId, targetGuild);
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
