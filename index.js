require('dotenv').config();
const { Client, GatewayIntentBits } = require("discord.js");
const { joinVoiceChannel, createAudioPlayer, createAudioResource } = require("@discordjs/voice");
const path = require("path");
const express = require("express");
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

app.use(require('cors')());
app.use(express.json());

const multer = require("multer");
const storage = multer.memoryStorage(); 
const upload = multer({ storage: storage });

app.post("/upload", upload.single("audio"), async (req, res) => {
    console.log("Arquivo recebido:", req.file);
    console.log("Tipo de arquivo:", req.file.mimetype);

    if (!req.file) {
        return res.status(400).json({ message: "Nenhum arquivo foi enviado." });
    }

    try {
        const { data, error } = await supabase
            .storage
            .from('audios') // Nome do seu bucket no Supabase
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

const keepAlive = (guildId) => {
    setInterval(() => {
        if (connections[guildId]) {
            const { connection } = connections[guildId];

            // Envia uma ação qualquer para manter a conexão ativa
            connection.receiver.speaking;
            console.log("Mantendo a conexão ativa...");
        }
    }, 30 * 1000); 
};

// Rota para tocar áudio
app.post("/play", async (req, res) => {
    const { audioFile } = req.body;

    console.log("Áudio recebido: ", audioFile);

    const guildId = Object.keys(connections)[0];

    if (!connections[guildId]) {
        return res.status(400).json({ error: "Não foi encontrada uma conexão ativa para este guildId." });
    }

    try {
        const { channelId, connection } = connections[guildId];

        // Obtendo a URL pública do Supabase
        const { data, error } = await supabase
            .storage
            .from('audios')  // Nome do seu bucket
            .getPublicUrl(audioFile.name);  // Nome do arquivo

        if (error) {
            return res.status(500).json({ error: "Erro ao acessar o áudio no Supabase.", details: error });
        }

        console.log("URL do áudio:", data.publicUrl);

        // Criando o recurso de áudio com a URL pública
        const player = createAudioPlayer();
        const resource = createAudioResource(data.publicUrl);  // Passando a URL pública

        player.play(resource);
        connection.subscribe(player);

        keepAlive(guildId);

        res.json({ message: `Tocando ${audioFile.name} no servidor ${guildId} no canal ${channelId}` });
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


client.login("MTM0OTQ1OTMwMzEyNzMxODYzNA.G82_tt.iCj-zYQWT1s4QxgM1BBsbOiBrRH5zBZedhRyw8");
