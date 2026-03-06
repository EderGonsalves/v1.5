const https = require("https");
const url = "https://automation-db.riasistemas.com.br/api/database/rows/table/225/?user_field_names=true&filter__InstitutionID__equal=2722&size=1";

const req = https.get(url, { headers: { Authorization: "Token jSOTmQbEzFZUOxMSkOs6t5KARjTTaH3S" } }, (res) => {
  let data = "";
  res.on("data", (chunk) => (data += chunk));
  res.on("end", () => {
    try {
      const json = JSON.parse(data);
      console.log("Total de casos para InstitutionID 2722:", json.count);
      if (json.results && json.results[0]) {
        const c = json.results[0];
        console.log("Exemplo (primeiro caso):", {
          id: c.id,
          CaseId: c.CaseId,
          CustumerName: c.CustumerName,
          CustumerPhone: c.CustumerPhone,
          InstitutionID: c.InstitutionID,
        });
      }
    } catch (e) {
      console.log("Status:", res.statusCode);
      console.log("Response:", data.slice(0, 500));
    }
  });
});
req.on("error", (e) => console.error("Erro:", e.message));
