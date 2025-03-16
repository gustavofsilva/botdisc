require('dotenv').config();
const { Client, GatewayIntentBits } = require("discord.js");
const { joinVoiceChannel, createAudioPlayer, createAudioResource } = require("@discordjs/voice");
const express = require("express");
const cors = require('cors');
const fs = require("fs");
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
const axios = require('axios');

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
const KEY_FILE_PATH = "./earnest-vent-233202-180a33ac5c51.json";
const SCOPES = ["https://www.googleapis.com/auth/drive"];
const { google } = require('googleapis');
const uploadImg = multer({ storage: multer.memoryStorage() });
const stream = require('stream');
const { PassThrough } = require('stream');
const path = require('path');


const auth = new google.auth.GoogleAuth({
    keyFile: KEY_FILE_PATH,
    scopes: SCOPES,
});

const drive = google.drive({ version: "v3", auth });

app.get("/images", async (req, res) => {
    console.log("Buscando imagens...");
    try {
        let files = [];
        let pageToken = null;

        // Enquanto houver mais resultados para buscar
        do {
            const response = await drive.files.list({
                q: "mimeType contains 'image/'", // Filtra apenas arquivos de imagem
                fields: "files(id, name), nextPageToken", // Obtém o id, nome e o token da próxima página, se houver
                pageToken: pageToken, // Passa o token da próxima página, se houver
            });

            // Para cada arquivo, baixar a imagem e salvar no servidor
            for (const file of response.data.files) {
                const fileUrl = `https://drive.google.com/uc?id=${file.id}&export=download`;
                const fileName = encodeURIComponent(file.name);  // Garante que o nome seja válido para o sistema de arquivos
                console.log("Baixando a imagem:", fileName);

                const savePath = path.join(__dirname, 'images', fileName);

                if (!fs.existsSync(savePath)) {
                    console.log(`O arquivo ${fileName} ainda não existe, baixando...`);

                    const writer = fs.createWriteStream(savePath);

                    const imageResponse = await axios({
                        method: 'get',
                        url: fileUrl,
                        responseType: 'stream',
                    });

                    console.log("Baixando aqui: ", imageResponse.data);

                    imageResponse.data.pipe(writer);

                    await new Promise((resolve, reject) => {
                        writer.on('finish', resolve);
                        writer.on('error', reject);
                    });

                    console.log(`Imagem ${fileName} salva com sucesso.`);
                } else {
                    console.log(`A imagem ${fileName} já existe no servidor.`);
                }

                files.push({
                    id: file.id,
                    name: fileName,
                    url: `/images/${fileName}`,
                });
            }

            pageToken = response.data.nextPageToken;
        } while (pageToken);

        res.json(files);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.use('/images', express.static(path.join(__dirname, 'images')));



app.post('/uploadImagem', upload.single('image'), async (req, res) => {
    if (!req.file) {
        return res.status(400).send({ success: false, message: 'Nenhuma imagem foi enviada.' });
    }

    try {
        // Criação de um arquivo no Google Drive
        const fileMetadata = {
            name: req.file.originalname,  // Nome original do arquivo
            mimeType: req.file.mimetype,  // Tipo MIME da imagem
        };

        // Converter o Buffer para um stream
        const bufferStream = new stream.PassThrough();
        bufferStream.end(req.file.buffer);

        const media = {
            mimeType: req.file.mimetype,
            body: bufferStream,  // Enviar o stream para o Google Drive
        };

        // Enviar para o Google Drive
        const response = await drive.files.create({
            resource: fileMetadata,
            media: media,
            fields: 'id',  // Apenas o id do arquivo
        });

        const fileId = response.data.id;

        // Tornar o arquivo público (permite acesso por qualquer pessoa com o link)
        await drive.permissions.create({
            fileId: fileId,
            resource: {
                type: 'anyone',
                role: 'reader',  // Permissão de leitura pública
            },
        });

        // Gerar a URL pública do arquivo
        const fileUrl = `https://drive.google.com/uc?id=${fileId}`;

        res.json({ success: true, message: 'Imagem enviada com sucesso!', fileUrl });
    } catch (error) {
        console.error('Erro ao enviar a imagem para o Google Drive:', error);
        res.status(500).json({ success: false, message: 'Erro ao enviar imagem para o Google Drive.', error: error.message });
    }
});











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

    if (!lastGuildId || !connections[lastGuildId]) {
        return res.status(400).json({ error: "Nenhuma conexão ativa para tocar o áudio." });
    }


    try {
        const { url, name } = audioFile;

        console.log("URL do áudio:", url);

        const { channelId, connection } = connections[lastGuildId];

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

let lastGuildId = null;

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

        lastGuildId = guildId;
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

function stopBotActions() {
    for (const guildId in connections) {
        if (connections[guildId]) {
            const { connection } = connections[guildId];

            if (connection) {
                connection.destroy();
            }

            delete connections[guildId];
        }
    }
    console.log("✅ Todas as conexões e ações do bot foram encerradas.");
}

client.login("MTM0OTQ1OTMwMzEyNzMxODYzNA.G82_tt.iCj-zYQWT1s4QxgM1BBsbOiBrRH5zBZedhRyw8");
