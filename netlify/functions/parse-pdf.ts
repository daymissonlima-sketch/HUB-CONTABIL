import { createRequire } from "module";

const require = createRequire(import.meta.url);
const pdf = require("pdf-parse");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Content-Type": "application/json",
};

export const handler = async (event: any) => {
  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 204,
      headers: corsHeaders,
      body: "",
    };
  }

  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      headers: corsHeaders,
      body: JSON.stringify({ error: "Método não permitido. Utilize POST." }),
    };
  }

  try {
    const payload = typeof event.body === "string" ? JSON.parse(event.body || "{}") : event.body || {};
    const { pdfBase64 } = payload;

    if (!pdfBase64) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ error: "O conteúdo em base64 do PDF é obrigatório." }),
      };
    }

    const buffer = Buffer.from(pdfBase64, "base64");
    const parsedData = await pdf(buffer);

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({ text: parsedData.text || "" }),
    };
  } catch (err: any) {
    console.error("Netlify PDF Parser Error:", err);
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({
        error: `Erro ao extrair texto do PDF: ${err.message || "Erro desconhecido"}`,
      }),
    };
  }
};
