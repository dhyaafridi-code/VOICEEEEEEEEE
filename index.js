require('dotenv').config();
const { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder } = require('discord.js');
const { joinVoiceChannel, entersState, VoiceConnectionStatus } = require('@discordjs/voice');
const express = require('express');

// إعداد سيرفر وهمي لـ Render
const app = express();
const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => {
    res.send('Bot is running and fully updated!');
});

app.listen(PORT, () => {
    console.log(`Server is listening on port ${PORT}`);
});

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] });
const MY_USER_ID = '851812052628275280';

// متغيرات الحالة للتحكم في البوت
let lastChannelId = null;
let lastGuildId = null;
let activeConnection = null;
let isFollowing = true; // مفتاح لتفعيل أو إيقاف ميزة التتبع

client.on('voiceStateUpdate', async (oldState, newState) => {
    // إذا كانت ميزة التتبع متوقفة (ماتتبعنيش)، فلا تفعل شيئاً
    if (!isFollowing) return;

    if (newState.member.id === MY_USER_ID) {
        if (newState.channelId) {
            lastChannelId = newState.channelId;
            lastGuildId = newState.guild.id;

            if (!activeConnection || activeConnection.joinConfig.channelId !== newState.channelId) {
                setTimeout(async () => {
                    await connectToChannel(newState.channelId, newState.guild);
                }, 500);
            }
        }
    }
});

async function connectToChannel(channelId, guild) {
    try {
        if (activeConnection) {
            activeConnection.destroy();
            activeConnection = null;
        }

        const connection = joinVoiceChannel({
            channelId: channelId,
            guildId: guild.id,
            adapterCreator: guild.voiceAdapterCreator,
            selfDeaf: true,
            selfMute: true
        });

        activeConnection = connection;

        connection.on(VoiceConnectionStatus.Disconnected, async () => {
            try {
                await Promise.race([
                    entersState(connection, VoiceConnectionStatus.Signalling, 5_000),
                    entersState(connection, VoiceConnectionStatus.Connecting, 5_000),
                ]);
            } catch (error) {
                connection.destroy();
                activeConnection = null;
                // يعود فقط إذا كانت ميزة التتبع مفعلة وتوجد قناة سابقة
                if (isFollowing && lastChannelId && lastGuildId) {
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

// استقبال الأوامر النصية للتحكم الفوري
client.on('messageCreate', async (message) => {
    // السماح فقط لك أنت بالتحكم في البوت
    if (message.author.id !== MY_USER_ID) return;

    const args = message.content.trim().split(/ +/);
    const command = args.shift().toLowerCase();

    // 1. أمر التوقف عن التتبع: "!ماتتبعنيش" أو "!stop"
    if (command === '!ماتتبعنيش' || command === '!stop') {
        isFollowing = false;
        message.react('🛑');
        message.reply('تم إيقاف التتبّع! لن أتحرك معك بعد الآن حتى أطلب مني ذلك.');
    }

    // 2. أمر استئناف التتبع: "!اتبعني" أو "!follow"
    if (command === '!اتبعني' || command === '!follow') {
        isFollowing = true;
        message.react('✅');
        message.reply('تم تفعيل التتبّع من جديد! سأتبعك أينما ذهبت.');
    }

    // 3. أمر إرسال البوت لشانل محددة بالآي دي: "!روح [Channel_ID]"
    if (command === '!روح' || command === '!join') {
        const targetChannelId = args[0];
        if (!targetChannelId) {
            return message.reply('يرجى كتابة آي دي القناة الصوتية بعد الأمر، مثال: `!روح 123456789`');
        }

        const channel = client.channels.cache.get(targetChannelId);
        if (channel && channel.isVoiceBased()) {
            isFollowing = false; // نوقف التتبع التلقائي مؤقتاً حتى يثبت في هذه الشانل
            lastChannelId = channel.id;
            lastGuildId = channel.guild.id;
            await connectToChannel(channel.id, channel.guild);
            message.react('👍');
            message.reply(`تم الانتقال إلى القناة: **${channel.name}** وثبيتي فيها بنجاح.`);
        } else {
            message.reply('لم يتم العثور على القناة أو أنها ليست قناة صوتية!');
        }
    }

    // 4. أمر إخراج البوت نهائياً من الفويس: "!احبس" أو "!leave"
    if (command === '!احبس' || command === '!disconnect') {
        if (activeConnection) {
            isFollowing = false;
            activeConnection.destroy();
            activeConnection = null;
            lastChannelId = null;
            message.react('👋');
            message.reply('تم قطع الاتصال ومغادرة الفويس.');
        } else {
            message.reply('لست متصلاً بأي قناة صوتية حالياً.');
        }
    }

    // 5. أمر حالة البوت: "!حالة" أو "!status"
    if (command === '!حالة' || command === '!status') {
        message.reply(`حالة البوت:\n- التتبع التلقائي: \`${isFollowing ? 'مفعل (يعمل)' : 'متوقف'}\`\n- متصل حالياً: \`${activeConnection ? 'نعم' : 'لا'}\``);
    }
});

client.once('ready', () => {
    console.log(`Logged in as ${client.user.tag}! Bot is ready with extra commands.`);
});

client.login(process.env.DISCORD_TOKEN);
