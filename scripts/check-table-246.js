const https = require("https");

// Listar campos da tabela 246
const url = "https://automation-db.riasistemas.com.br/api/database/rows/table/246/?user_field_names=true&size=1";

const req = https.get(url, { headers: { Authorization: "Token jSOTmQbEzFZUOxMSkOs6t5KARjTTaH3S" } }, (res) => {
  let data = "";
  res.on("data", (chunk) => (data += chunk));
  res.on("end", () => {
    console.log("Status:", res.statusCode);
    try {
      const json = JSON.parse(data);
      console.log("Total rows:", json.count);
      if (json.results && json.results[0]) {
        console.log("\nCampos encontrados na tabela 246:");
        const row = json.results[0];
        for (const [key, value] of Object.entries(row)) {
          console.log(`  ${key}: ${JSON.stringify(value)}`);
        }
      } else {
        console.log("Tabela vazia ou não encontrada");
        console.log("Response:", JSON.stringify(json, null, 2).slice(0, 1000));
      }
    } catch (e) {
      console.log("Erro parsing:", e.message);
      console.log("Response:", data.slice(0, 500));
    }
  });
});
req.on("error", (e) => console.error("Erro:", e.message));
