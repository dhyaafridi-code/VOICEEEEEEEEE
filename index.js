require('dotenv').config();
const { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder } = require('discord.js');
const { joinVoiceChannel, entersState, VoiceConnectionStatus } = require('@discordjs/voice');
const express = require('express');

// إعداد سيرفر وهمي لـ Render
const app = express();
const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => {
    res.send('Bot with Slash Commands is running!');
});

app.listen(PORT, () => {
    console.log(`Server is listening on port ${PORT}`);
});

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates] });
const MY_USER_ID = '851812052628275280';

let lastChannelId = null;
let lastGuildId = null;
let activeConnection = null;
let isFollowing = true;

// 1. تسجيل وتسعير أوامر السلاش (Slash Commands)
const commands = [
    new SlashCommandBuilder()
        .setName('stop')
        .setDescription('إيقاف تتبع البوت لك وتثبيته في مكانه'),
    new SlashCommandBuilder()
        .setName('follow')
        .setDescription('إعادة تفعيل التتبع التلقائي لصوتك'),
    new SlashCommandBuilder()
        .setName('join')
        .setDescription('إرسال البوت إلى قناة صوتية محددة بالآي دي')
        .addStringOption(option =>
            option.setName('channel_id')
                .setDescription('اكتب آي دي القناة الصوتية')
                .setRequired(true)),
    new SlashCommandBuilder()
        .setName('leave')
        .setDescription('إخراج البوت نهائياً من الفويس'),
    new SlashCommandBuilder()
        .setName('status')
        .setDescription('عرض حالة البوت الحالية وتتبع الصوت')
].map(command => command.toJSON());

// دالة تسجيل الأوامر عند تشغيل البوت
client.once('ready', async () => {
    console.log(`Logged in as ${client.user.tag}!`);

    const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

    try {
        console.log('Started refreshing application (/) commands.');

        // تسجيل الأوامر على مستوى السيرفر (تظهر فوراً في السيرفر الخاص بك)
        await rest.put(
            Routes.applicationCommands(client.user.id),
            { body: commands },
        );

        console.log('Successfully reloaded application (/) commands.');
    } catch (error) {
        console.error(error);
    }
});

// تتبع حركتك الصوتية ودخول الفويس
client.on('voiceStateUpdate', async (oldState, newState) => {
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

// 2. استقبال وتنفيذ أوامر السلاش (Slash Commands Interaction)
client.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand()) return;

    // حماية الأوامر لتكون خاصة بك وحدك
    if (interaction.user.id !== MY_USER_ID) {
        return interaction.reply({ content: 'عذراً، هذه الأوامر مخصصة لصاحب البوت فقط!', ephemeral: true });
    }

    const { commandName } = interaction;

    if (commandName === 'stop') {
        isFollowing = false;
        await interaction.reply({ content: '🛑 تم إيقاف التتبع التلقائي! لن أتحرك معك بعد الآن.', ephemeral: false });
    } 
    
    else if (commandName === 'follow') {
        isFollowing = true;
        await interaction.reply({ content: '✅ تم تفعيل التتبع من جديد! سأتبعك أينما ذهبت.', ephemeral: false });
    } 
    
    else if (commandName === 'join') {
        const targetChannelId = interaction.options.getString('channel_id');
        const channel = client.channels.cache.get(targetChannelId);

        if (channel && channel.isVoiceBased()) {
            isFollowing = false; // تثبيت البوت وإيقاف التتبع المؤقت
            lastChannelId = channel.id;
            lastGuildId = channel.guild.id;
            await connectToChannel(channel.id, channel.guild);
            await interaction.reply({ content: `👍 تم الانتقال إلى القناة **${channel.name}** وثبيتي فيها بنجاح.`, ephemeral: false });
        } else {
            await interaction.reply({ content: '❌ لم يتم العثور على القناة أو أنها ليست قناة صوتية صحيحة!', ephemeral: true });
        }
    } 
    
    else if (commandName === 'leave') {
        if (activeConnection) {
            isFollowing = false;
            activeConnection.destroy();
            activeConnection = null;
            lastChannelId = null;
            await interaction.reply({ content: '👋 تم قطع الاتصال ومغادرة الفويس نهائياً.', ephemeral: false });
        } else {
            await interaction.reply({ content: '⚠️ البوت ليس متصلاً بأي قناة صوتية حالياً.', ephemeral: true });
        }
    } 
    
    else if (commandName === 'status') {
        await interaction.reply({
            content: `📊 **حالة البوت:**\n- التتبع التلقائي: \`${isFollowing ? 'مفعل (يعمل)' : 'متوقف'}\`\n- متصل بالفويس: \`${activeConnection ? 'نعم' : 'لا'}\``,
            ephemeral: true
        });
    }
});

client.login(process.env.DISCORD_TOKEN);
