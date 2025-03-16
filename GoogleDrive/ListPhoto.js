async function listFiles() {
    try {
        const res = await drive.files.list({
            pageSize: 10,
            fields: "files(id, name)",
        });

        console.log("Arquivos encontrados:");
        res.data.files.forEach((file) => {
            console.log(`📂 ${file.name} (ID: ${file.id})`);
        });

        return res.data.files;
    } catch (error) {
        console.error("Erro ao listar arquivos:", error);
    }
}
