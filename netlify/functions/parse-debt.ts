import { GoogleGenAI, Type } from "@google/genai";

const ai = process.env.GEMINI_API_KEY
  ? new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY,
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build",
        },
      },
    })
  : null;

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
    const { text, category } = payload;

    if (!text || text.trim() === "") {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ error: "O texto do relatório não pode estar vazio." }),
      };
    }

    if (!ai) {
      return {
        statusCode: 503,
        headers: corsHeaders,
        body: JSON.stringify({
          error: "O serviço de IA (Gemini API) não está configurado. Defina a variável de ambiente GEMINI_API_KEY no painel da Netlify.",
        }),
      };
    }

    const systemInstruction = `Você é um assistente especializado em auditoria e contabilidade fiscal no Brasil.
Seu objetivo é extrair informações de relatórios de débitos fiscais (como Diagnóstico Fiscal da Receita Federal do Brasil, SIEF, etc.) fornecidos em formato de texto bruto.

Extraia as seguintes informações do texto:
1. Dados do Cliente:
   - CNPJ (apenas números e caracteres de formatação, ex: 56.159.752/0001-54)
   - Nome/Razão Social da empresa (ex: ENCHRIDION TECH LTDA)

2. Lista de Débitos / Pendências:
   Para cada linha ou item de débito listado na seção "Pendência - Débito" ou similar, extraia:
   - code: Código da receita se houver (ex: "1099-01", "4406-01", "5440-01"). Caso não haja código explícito, deixe vazio ou null.
   - categoryRaw: Descrição/tipo do débito ou receita (ex: "CP-SEGUR.", "MAED - PGDAS-D", "SIMPLES NACIONAL", "MULTA").
   - period: Período de apuração (PA/Exercício) no formato "MM/AAAA" (ex: "07/2025").
   - dueDate: Data de vencimento no formato "DD/MM/AAAA" (ex: "20/08/2025").
   - principal: Valor original ou principal (número decimal).
   - penalty: Valor da multa (número decimal).
   - interest: Valor dos juros (número decimal).
   - total: Valor do saldo devedor consolidado ou total (número decimal).
   - status: Situação/status do débito (ex: "DEVEDOR", "SUSPENSO", "A VENCER").

Instruções importantes:
- Ignore linhas de cabeçalho, rodapés, nomes de sócios ou administradores, e outras informações irrelevantes na lista de débitos.
- Converta valores numéricos monetários (que vêm com pontos e vírgulas, ex: "333,96" ou "1.234,56") para números decimais corretos de JS (ex: 333.96, 1234.56).
- Se faltar algum campo de valor (como Multa ou Juros), use 0.
- Se o formato estiver um pouco deslocado ou fora de padrão, use seu raciocínio contextual para alinhar as colunas corretamente.${
      category
        ? `\n\nATENÇÃO ESPECIAL: O usuário selecionou especificamente a categoria de débito "${category}". Todos os débitos listados no texto enviado pertencem exclusivamente a essa categoria ou tributo. Atribua e alinhe a descrição/categoria de cada débito de forma correspondente ou consistente com "${category}".`
        : ""
    }`;

    const responseSchema = {
      type: Type.OBJECT,
      properties: {
        clientInfo: {
          type: Type.OBJECT,
          properties: {
            cnpj: { type: Type.STRING },
            name: { type: Type.STRING },
          },
          required: ["cnpj", "name"],
        },
        debts: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              code: { type: Type.STRING, description: "Código da receita, ex: 1099-01" },
              categoryRaw: { type: Type.STRING, description: "Descrição ou sigla do tributo, ex: CP-SEGUR" },
              period: { type: Type.STRING, description: "PA / Exercício, ex: 07/2025" },
              dueDate: { type: Type.STRING, description: "Data de vencimento, ex: 20/08/2025" },
              principal: { type: Type.NUMBER, description: "Valor original ou principal" },
              penalty: { type: Type.NUMBER, description: "Valor de multa" },
              interest: { type: Type.NUMBER, description: "Valor de juros" },
              total: { type: Type.NUMBER, description: "Valor total / consolidado" },
              status: { type: Type.STRING, description: "Status, ex: DEVEDOR, SUSPENSO, A VENCER" },
            },
            required: ["categoryRaw", "period", "principal", "penalty", "interest", "total"],
          },
        },
      },
      required: ["clientInfo", "debts"],
    };

    const modelsToTry = ["gemini-3.5-flash", "gemini-flash-latest", "gemini-3.1-flash-lite", "gemini-2.5-flash"];
    let result = null;
    let lastError: any = null;

    for (const model of modelsToTry) {
      try {
        const response = await ai.models.generateContent({
          model: model,
          contents: text,
          config: {
            systemInstruction: systemInstruction,
            responseMimeType: "application/json",
            responseSchema: responseSchema,
          },
        });
        result = response;
        break;
      } catch (err: any) {
        lastError = err;
      }
    }

    if (!result) {
      throw lastError || new Error("Não foi possível obter resposta da IA.");
    }

    const parsedJSON = JSON.parse(result.text || "{}");
    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify(parsedJSON),
    };
  } catch (error: any) {
    console.error("Netlify Gemini Parse Error:", error);
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ error: error?.message || "Erro ao processar as informações através da IA." }),
    };
  }
};
