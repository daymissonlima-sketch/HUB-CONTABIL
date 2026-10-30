import forge from "node-forge";

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
    const { pfxBase64, password } = payload;

    if (!pfxBase64) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ error: "O arquivo em base64 do certificado é obrigatório." }),
      };
    }

    const pfxDer = Buffer.from(pfxBase64, "base64").toString("binary");
    const asn1 = forge.asn1.fromDer(pfxDer);
    const p12 = forge.pkcs12.fromPkcs12Asn1(asn1, password || "");

    const certBags = p12.getBags({ bagType: forge.pki.oids.certBag });
    const certBag = certBags[forge.pki.oids.certBag]?.[0];
    if (!certBag) {
      throw new Error("Não foi possível encontrar a chave do certificado no arquivo.");
    }

    const cert = certBag.cert;
    const subject = cert.subject.attributes;
    const issuer = cert.issuer.attributes;

    const getAttr = (attrs: any[], name: string) => {
      const found = attrs.find((a: any) => a.name === name || a.shortName === name);
      return found ? found.value : "";
    };

    const commonName = getAttr(subject, "commonName") || "Certificado ICP-Brasil";
    const issuerCN = getAttr(issuer, "commonName") || getAttr(issuer, "organizationName") || "AC Soluti (ICP-Brasil)";
    const serialNumber = cert.serialNumber || `SN${Math.floor(Math.random() * 10000000)}`;
    const validTo = cert.validity.notAfter;
    const validFrom = cert.validity.notBefore;

    let cnpj = "";
    const ouAttr = subject.filter((a: any) => a.name === "organizationalUnitName" || a.shortName === "OU");
    ouAttr.forEach((attr: any) => {
      const val = String(attr.value);
      if (val.includes("CNPJ:")) {
        cnpj = val.split("CNPJ:")[1].trim();
      } else {
        const match = val.match(/\d{14}/);
        if (match) cnpj = match[0];
      }
    });

    if (!cnpj) {
      const match = commonName.match(/\d{14}/);
      if (match) cnpj = match[0];
    }

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({
        commonName,
        cnpj,
        issuer: issuerCN,
        serialNumber,
        validTo: validTo.toLocaleDateString("pt-BR"),
        validFrom: validFrom.toLocaleDateString("pt-BR"),
      }),
    };
  } catch (err: any) {
    console.error("Netlify Cert Parser Error:", err);
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({
        error: `Senha inválida ou certificado corrompido: ${err.message || "Erro desconhecido"}`,
      }),
    };
  }
};
