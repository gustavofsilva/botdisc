const { Client, GatewayIntentBits } = require("discord.js");
const { joinVoiceChannel, createAudioPlayer, createAudioResource } = require("@discordjs/voice");
const path = require("path");
const express = require("express");
const fs = require("fs");
const multer = require("multer");

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

const app = express();
const upload = multer({ dest: "audios/" });

app.use(require('cors')());
app.use(express.json());

// Rota para receber o arquivo de áudio
app.post("/upload", upload.single("audio"), (req, res) => {
    if (!req.file) {
        return res.status(400).json({ message: "Nenhum arquivo foi enviado." });
    }

    const shortTimestamp = Date.now().toString().slice(-6);
    const newFileName = `${shortTimestamp}-${req.file.originalname}`;
    const newFilePath = path.join(__dirname, "audios", newFileName);

    fs.rename(req.file.path, newFilePath, (err) => {
        if (err) {
            return res.status(500).json({ message: "Erro ao salvar o arquivo." });
        }

        res.json({ message: "Áudio enviado e salvo com sucesso!" });
    });
});

// Rota para listar os áudios na pasta "audios"
app.get("/audios", (req, res) => {
    const audiosDir = path.join(__dirname, "audios");

    fs.readdir(audiosDir, (err, files) => {
        if (err) {
            return res.status(500).json({ error: "Erro ao ler os arquivos de áudio." });
        }

        // Filtra os arquivos de áudio (.mp3 ou .wav)
        const audioFiles = files.filter(file => file.endsWith('.mp3') || file.endsWith('.wav'));
        res.json({ audios: audioFiles });
    });
});

const keepAlive = (guildId) => {
    setInterval(() => {
        if (connections[guildId]) {
            const { connection } = connections[guildId];

            // Envia uma ação qualquer para manter a conexão ativa
            connection.receiver.speaking; // Isso apenas acessa o objeto, você pode fazer outras ações
            console.log("Mantendo a conexão ativa...");
        }
    }, 30 * 1000); // Exemplo: checar a cada 30 segundos
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

        // Usando o channelId da conexão salva
        const player = createAudioPlayer();
        const resource = createAudioResource(path.join(__dirname, "audios", audioFile));

        player.play(resource);
        connection.subscribe(player);

        keepAlive(guildId);

        res.json({ message: `Tocando ${audioFile} no servidor ${guildId} no canal ${channelId}` });
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

// Responde aos comandos do Discord
const connections = {}; // Objeto para armazenar as conexões por guildId

client.on("messageCreate", async (message) => {
    if (message.content === "a") {
        if (!message.member.voice.channel) {
            return message.reply("Você precisa estar em um canal de voz!");
        }

        // Obtém o guildId e o channelId
        const guildId = message.guild.id; // Guild ID
        const channelId = message.member.voice.channel.id; // Channel ID

        // Printando os valores
        console.log(`Bot está entrando no servidor: ${guildId}`);
        console.log(`Bot está entrando no canal de voz: ${channelId}`);

        // Armazenando a conexão para uso posterior
        connections[guildId] = {
            channelId: channelId,
            connection: joinVoiceChannel({
                channelId: channelId,
                guildId: guildId,
                adapterCreator: message.guild.voiceAdapterCreator
            })
        };

        // Aqui não precisamos tocar o áudio agora, apenas salvar as conexões
        console.log(`Conexão salva para o servidor ${guildId} no canal ${channelId}`);
    }
});


client.login("MTM0OTQ1OTMwMzEyNzMxODYzNA.G82_tt.iCj-zYQWT1s4QxgM1BBsbOiBrRH5zBZedhRyw8");
