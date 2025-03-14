require('dotenv').config();
const { Client, GatewayIntentBits } = require("discord.js");
const { joinVoiceChannel, createAudioPlayer, createAudioResource } = require("@discordjs/voice");
const express = require("express");
const cors = require('cors');
const fs = require("fs");
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

const app = express();
app.use(cors());

// Exemplo de rota
app.get("/", (req, res) => {
    res.send("API funcionando!");
});
app.use(express.json());

const multer = require("multer");
const https = require('https');
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });
const { Readable } = require("stream");

app.post("/upload", upload.single("audio"), async (req, res) => {
    console.log("Arquivo recebido:", req.file);
    console.log("Tipo de arquivo:", req.file.mimetype);

    if (!req.file) {
        return res.status(400).json({ message: "Nenhum arquivo foi enviado." });
    }

    try {
        const { data, error } = await supabase
            .storage
            .from('audios')
            .upload(`${req.file.originalname}`, req.file.buffer, {
                contentType: req.file.mimetype,
            });

        if (error) {
            console.error("Erro no upload:", error);
            return res.status(500).json({ message: "Erro ao fazer upload do áudio." });
        }

        console.log("Arquivo enviado com sucesso:", data);
        res.status(200).json({ message: "Arquivo enviado com sucesso!", url: data?.Key });
    } catch (err) {
        console.error("Erro ao processar o arquivo:", err);
        res.status(500).json({ message: "Erro ao processar o arquivo." });
    }
});

app.get("/audios", async (req, res) => {
    try {
        const { data, error } = await supabase
            .storage
            .from('audios')
            .list('', {
                sortBy: { column: 'name', order: 'asc' },
            });

        if (error) {
            return res.status(500).json({ error: "Erro ao listar os arquivos de áudio.", details: error });
        }

        const audioFiles = data.filter(file =>
            file.name.endsWith('.mp3') ||
            file.name.endsWith('.wav') ||
            file.name.endsWith('.ogg') ||
            file.name.endsWith('.flac') ||
            file.name.endsWith('.aac') ||
            file.name.endsWith('.m4a') ||
            file.name.endsWith('.wma') ||
            file.name.endsWith('.alac') ||
            file.name.endsWith('.opus')
        );

        const audioUrls = audioFiles.map(file => {
            return {
                name: file.name,
                url: `${process.env.SUPABASE_URL}/storage/v1/object/public/audios/${file.name}`
            };
        });

        res.json({ audios: audioUrls });
    } catch (err) {
        console.error("Erro ao listar arquivos:", err);
        res.status(500).json({ error: "Erro inesperado ao buscar arquivos de áudio." });
    }
});

const keepAliveIntervals = {};

const keepAlive = (guildId) => {
    if (keepAliveIntervals[guildId]) {
        console.log(`Já existe um keepAlive ativo para o guildId ${guildId}`);
        return;
    }

    console.log(`🔄 Iniciando Keep Alive para o guildId ${guildId}`);

    keepAliveIntervals[guildId] = setInterval(() => {
        if (connections[guildId]) {
            console.log(`Mantendo a conexão ativa para ${guildId}...`);
        } else {
            clearInterval(keepAliveIntervals[guildId]); // Para o intervalo
            delete keepAliveIntervals[guildId]; // Remove da memória
            console.log(`🛑 Keep Alive encerrado para ${guildId}`);
        }
    }, 30 * 1000);  // 30 segundos
};

app.post("/play", async (req, res) => {
    const { audioFile } = req.body;
    const guildId = Object.keys(connections)[0];

    if (!connections[guildId]) {
        return res.status(400).json({ error: "Nenhuma conexão ativa para este guildId." });
    }

    try {
        const { url, name } = audioFile;

        console.log("URL do áudio:", url);

        const { channelId, connection } = connections[guildId];

        const player = createAudioPlayer();
        connection.subscribe(player);

        https.get(url, (response) => {
            if (response.statusCode !== 200) {
                console.error(`Erro: Status ${response.statusCode}`);
                return res.status(500).json({ error: "Erro ao baixar o áudio." });
            }

            let data = [];

            response.on("data", (chunk) => {
                data.push(chunk);
            });

            response.on("end", () => {
                const audioBuffer = Buffer.concat(data);

                const audioStream = Readable.from(audioBuffer);

                const resource = createAudioResource(audioStream);
                player.play(resource);

                console.log(`Tocando ${name} no servidor ${guildId} no canal ${channelId}`);
            });

        }).on("error", (error) => {
            console.error("Erro ao tocar o áudio:", error);
            return res.status(500).json({ error: "Erro ao tocar o áudio." });
        });

        keepAlive(guildId);

        res.json({ message: `Tocando ${name} no servidor ${guildId} no canal ${channelId}` });
    } catch (error) {
        console.error("Erro ao tocar o áudio:", error);
        res.status(500).json({ error: "Erro ao tocar o áudio." });
    }
});


const PORT = 3001;
app.listen(PORT, () => {
    console.log(`Servidor backend rodando na porta ${PORT}`);
});

client.once("ready", () => {
    console.log("Bot está online!");
});

const connections = {};

client.on("messageCreate", async (message) => {
    if (message.content === "a") {
        if (!message.member.voice.channel) {
            return message.reply("Você precisa estar em um canal de voz!");
        }

        const guildId = message.guild.id;
        const channelId = message.member.voice.channel.id;

        console.log(`Bot está entrando no servidor: ${guildId}`);
        console.log(`Bot está entrando no canal de voz: ${channelId}`);

        connections[guildId] = {
            channelId: channelId,
            connection: joinVoiceChannel({
                channelId: channelId,
                guildId: guildId,
                adapterCreator: message.guild.voiceAdapterCreator
            })
        };
    }
});

client.on("disconnect", () => {
    console.log("🚨 O bot foi desconectado do Discord!");
    stopBotActions();
});

client.on("shardDisconnect", (event, id) => {
    console.log(`🚨 O shard ${id} foi desconectado!`);
    stopBotActions();
});

// Função para parar ações do bot
function stopBotActions() {
    for (const guildId in connections) {
        if (connections[guildId]) {
            const { connection } = connections[guildId];

            // Parar o áudio
            if (connection) {
                connection.destroy();
            }

            // Remover a conexão da memória
            delete connections[guildId];
        }
    }
    console.log("✅ Todas as conexões e ações do bot foram encerradas.");
}

client.login("MTM0OTQ1OTMwMzEyNzMxODYzNA.G82_tt.iCj-zYQWT1s4QxgM1BBsbOiBrRH5zBZedhRyw8");
