const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
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

  try {
    const rawPath = event.path || "";
    const segments = rawPath.split("/").filter(Boolean);
    const cnpjParam = segments[segments.length - 1] || event.queryStringParameters?.cnpj || "";
    const cleanCnpj = cnpjParam.replace(/\D/g, "");

    if (cleanCnpj.length !== 14) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ error: "CNPJ inválido. Forneça um CNPJ com 14 dígitos." }),
      };
    }

    const headers = { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" };

    // 1. Try BrasilAPI first
    try {
      const brasilRes = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${cleanCnpj}`, { headers });
      if (brasilRes.ok) {
        const bData: any = await brasilRes.json();
        const isSimples = bData.opcao_pelo_simples === true;
        const socios = (bData.qsa || []).map((s: any) => ({
          nome: s.nome_socio || "",
          qualificacao_socio: { descricao: s.qualificacao_socio || "" },
        }));
        return {
          statusCode: 200,
          headers: corsHeaders,
          body: JSON.stringify({
            ...bData,
            razao_social: bData.razao_social || "",
            logradouro: bData.logradouro || "",
            numero: bData.numero || "",
            complemento: bData.complemento || "",
            bairro: bData.bairro || "",
            cep: bData.cep || "",
            municipio: bData.municipio || "",
            uf: bData.uf || "",
            simples: {
              optante: isSimples ? "Sim" : "Não",
              data_opcao: bData.data_opcao_pelo_simples || "",
              data_exclusao: bData.data_exclusao_do_simples || "",
            },
            mei: {
              optante: bData.opcao_pelo_mei === true || bData.opcao_pelo_mei === "Sim",
            },
            estabelecimento: {
              logradouro: bData.logradouro || "",
              numero: bData.numero || "",
              complemento: bData.complemento || "",
              bairro: bData.bairro || "",
              cep: bData.cep || "",
              email: bData.email || bData.correio_eletronico || "",
              telefone1: bData.ddd_telefone_1 || "",
              telefone2: bData.ddd_telefone_2 || "",
              cidade: { nome: bData.municipio || "" },
              estado: { sigla: bData.uf || "", nome: bData.uf || "" },
            },
            socios,
          }),
        };
      }
    } catch (bErr) {
      console.warn(`[CNPJ Function] BrasilAPI failed for ${cleanCnpj}, falling back to publica.cnpj.ws...`);
    }

    // 2. Fallback to publica.cnpj.ws
    const apiResponse = await fetch(`https://publica.cnpj.ws/cnpj/${cleanCnpj}`, { headers });
    if (apiResponse.status === 429) {
      return {
        statusCode: 429,
        headers: corsHeaders,
        body: JSON.stringify({
          error: "A API pública do CNPJ excedeu o limite de requisições por minuto. Aguarde um instante e tente novamente.",
        }),
      };
    }

    if (apiResponse.status === 404) {
      return {
        statusCode: 404,
        headers: corsHeaders,
        body: JSON.stringify({ error: "CNPJ não encontrado na base de dados da Receita Federal." }),
      };
    }

    if (!apiResponse.ok) {
      return {
        statusCode: apiResponse.status,
        headers: corsHeaders,
        body: JSON.stringify({ error: `Erro ao consultar a API pública de CNPJ (Código ${apiResponse.status}).` }),
      };
    }

    const data = await apiResponse.json();
    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify(data),
    };
  } catch (err: any) {
    console.error("[CNPJ Function] Error fetching CNPJ:", err);
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ error: "Erro de rede ou falha na comunicação com a API de CNPJ." }),
    };
  }
};
