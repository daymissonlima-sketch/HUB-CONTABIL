import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";
import dotenv from "dotenv";
import { createRequire } from "module";
import forge from "node-forge";
import { SignPdf } from "@signpdf/signpdf";
import { P12Signer } from "@signpdf/signer-p12";
import { pdflibAddPlaceholder } from "@signpdf/placeholder-pdf-lib";
import { PDFDocument } from "pdf-lib";

const require = createRequire(import.meta.url);
const pdf = require("pdf-parse");

dotenv.config();

// Helper to generate self-signed PKCS12 / P12 certificate with node-forge
function generateSelfSignedP12(companyName: string, cnpj: string): Buffer {
  const keys = forge.pki.rsa.generateKeyPair(2048);
  const cert = forge.pki.createCertificate();
  cert.publicKey = keys.publicKey;
  cert.serialNumber = '01';
  cert.validity.notBefore = new Date();
  cert.validity.notAfter = new Date();
  cert.validity.notAfter.setFullYear(cert.validity.notBefore.getFullYear() + 10); // 10 years validity

  const attrs = [
    { name: 'commonName', value: companyName },
    { name: 'countryName', value: 'BR' },
    { name: 'organizationName', value: companyName },
    { name: 'organizationalUnitName', value: cnpj ? `CNPJ: ${cnpj}` : 'Contabilidade' }
  ];
  cert.setSubject(attrs);
  cert.setIssuer(attrs);

  // Self-sign the certificate
  cert.sign(keys.privateKey, forge.md.sha256.create());

  // Package into PKCS12 format
  const p12Asn1 = forge.pkcs12.toPkcs12Asn1(
    keys.privateKey,
    [cert],
    'password', // Passphrase for P12
    { algorithm: '3des' }
  );
  const p12Der = forge.asn1.toDer(p12Asn1).getBytes();
  return Buffer.from(p12Der, 'binary');
}

// Custom P12Signer subclass to achieve ICP-Brasil / PAdES-BES compliance (for validar.iti.gov.br)
class CustomP12Signer extends P12Signer {
  async sign(pdfBuffer: Buffer, signingTime: Date | undefined = undefined): Promise<Buffer> {
    if (!(pdfBuffer instanceof Buffer)) {
      throw new Error('PDF expected as Buffer.');
    }

    const options = (this as any).options;
    const cert = (this as any).cert;

    // Convert Buffer P12 to a forge implementation.
    const p12Asn1 = forge.asn1.fromDer(cert);
    const p12 = forge.pkcs12.pkcs12FromAsn1(p12Asn1, options.asn1StrictParsing, options.passphrase);

    // Extract safe bags by type.
    const certBags = p12.getBags({
      bagType: forge.pki.oids.certBag
    })[forge.pki.oids.certBag];
    const keyBags = p12.getBags({
      bagType: forge.pki.oids.pkcs8ShroudedKeyBag
    })[forge.pki.oids.pkcs8ShroudedKeyBag];

    if (!keyBags || keyBags.length === 0) {
      throw new Error('Failed to find private key bags in PFX/P12.');
    }
    const privateKey = keyBags[0].key;

    // Here comes the actual PKCS#7 signing.
    const p7 = forge.pkcs7.createSignedData();
    p7.content = forge.util.createBuffer(pdfBuffer.toString('binary'));

    let certificate: any;
    if (certBags) {
      Object.keys(certBags).forEach(i => {
        const { publicKey } = certBags[i].cert;
        p7.addCertificate(certBags[i].cert);

        // Try to find the certificate that matches the private key.
        if (privateKey.n.compareTo(publicKey.n) === 0 && privateKey.e.compareTo(publicKey.e) === 0) {
          certificate = certBags[i].cert;
        }
      });
    }

    if (!certificate) {
      throw new Error('Failed to find a certificate that matches the private key.');
    }

    // Generate SHA-256 hash of the signing certificate (mandatory for PAdES-BES ICP-Brasil)
    const certDer = forge.asn1.toDer(forge.pki.certificateToAsn1(certificate)).getBytes();
    const md = forge.md.sha256.create();
    md.update(certDer, 'binary');
    const certHash = md.digest().getBytes();

    // Construct the PAdES-BES signingCertificateV2 attribute OID 1.2.840.113549.1.9.16.2.47
    // ESSCertIDv2 ::= SEQUENCE {
    //   hashAlgorithm AlgorithmIdentifier DEFAULT {algorithm id-sha256},
    //   certHash Hash,
    //   issuerSerial IssuerSerial OPTIONAL
    // }
    const signingCertificateV2Attr = {
      type: '1.2.840.113549.1.9.16.2.47', // id-aa-signingCertificateV2
      value: [
        forge.asn1.create(forge.asn1.Class.UNIVERSAL, forge.asn1.Type.SEQUENCE, true, [
          // certs SEQUENCE OF ESSCertIDv2
          forge.asn1.create(forge.asn1.Class.UNIVERSAL, forge.asn1.Type.SEQUENCE, true, [
            // ESSCertIDv2 SEQUENCE
            forge.asn1.create(forge.asn1.Class.UNIVERSAL, forge.asn1.Type.SEQUENCE, true, [
              // hashAlgorithm AlgorithmIdentifier
              forge.asn1.create(forge.asn1.Class.UNIVERSAL, forge.asn1.Type.SEQUENCE, true, [
                // algorithm OID: sha-256 '2.16.840.1.101.3.4.2.1'
                forge.asn1.create(forge.asn1.Class.UNIVERSAL, forge.asn1.Type.OID, false, forge.asn1.oidToDer('2.16.840.1.101.3.4.2.1').getBytes()),
                // parameters NULL
                forge.asn1.create(forge.asn1.Class.UNIVERSAL, forge.asn1.Type.NULL, false, '')
              ]),
              // certHash OCTET STRING
              forge.asn1.create(forge.asn1.Class.UNIVERSAL, forge.asn1.Type.OCTETSTRING, false, certHash)
            ])
          ])
        ])
      ]
    };

    // Add a sha256 signer with authenticated attributes
    p7.addSigner({
      key: privateKey,
      certificate,
      digestAlgorithm: forge.pki.oids.sha256,
      authenticatedAttributes: [
        {
          type: forge.pki.oids.contentType,
          value: forge.pki.oids.data
        },
        {
          type: forge.pki.oids.signingTime,
          value: signingTime ?? new Date()
        },
        {
          type: forge.pki.oids.messageDigest
        },
        signingCertificateV2Attr
      ]
    });

    // Sign in detached mode
    p7.sign({ detached: true });
    
    return Buffer.from(forge.asn1.toDer(p7.toAsn1()).getBytes(), 'binary');
  }
}

// Initialize Gemini API
const ai = process.env.GEMINI_API_KEY
  ? new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        }
      }
    })
  : null;

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Use JSON and urlencoded parser with generous limits
  app.use(express.json({ limit: "15mb" }));
  app.use(express.urlencoded({ limit: "15mb", extended: true }));

  // API Route: Smart parsing of unstructured RFB text using Gemini
  app.post("/api/gemini/parse-debt", async (req, res) => {
    try {
      const { text, category } = req.body;
      if (!text || text.trim() === "") {
        return res.status(400).json({ error: "O texto do relatório não pode estar vazio." });
      }

      if (!ai) {
        return res.status(503).json({
          error: "O serviço de IA (Gemini API) não está configurado. Verifique as credenciais no painel de Configurações."
        });
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
- Se o formato estiver um pouco deslocado ou fora de padrão, use seu raciocínio contextual para alinhar as colunas corretamente. Por exemplo, a coluna "Receita" costuma conter o código (como 1099-01) e a descrição (como CP-SEGUR.).${
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
              name: { type: Type.STRING }
            },
            required: ["cnpj", "name"]
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
                status: { type: Type.STRING, description: "Status, ex: DEVEDOR, SUSPENSO, A VENCER" }
              },
              required: ["categoryRaw", "period", "principal", "penalty", "interest", "total"]
            }
          }
        },
        required: ["clientInfo", "debts"]
      };

      // Try to generate content with gemini-3.5-flash (highest quota, modern), and fall back to other highly available models if any face high demand or quota issues.
      const modelsToTry = ["gemini-3.5-flash", "gemini-flash-latest", "gemini-3.1-flash-lite", "gemini-2.5-flash"];
      let result = null;
      let lastError = null;

      for (const model of modelsToTry) {
        let attempts = 0;
        const maxAttempts = 2;
        while (attempts < maxAttempts) {
          try {
            attempts++;
            console.log(`[Parse Debt] Trying model ${model} (attempt ${attempts}/${maxAttempts})...`);
            const response = await ai.models.generateContent({
              model: model,
              contents: text,
              config: {
                systemInstruction: systemInstruction,
                responseMimeType: "application/json",
                responseSchema: responseSchema,
              }
            });
            result = response;
            break;
          } catch (err: any) {
            lastError = err;
            console.error(`[Parse Debt] Model ${model} attempt ${attempts} failed:`, err?.message || err);
            if (attempts < maxAttempts) {
              await new Promise((resolve) => setTimeout(resolve, 1000));
            }
          }
        }
        if (result) break;
      }

      if (!result) {
        throw lastError || new Error("Não foi possível obter resposta de nenhuma das instâncias da IA.");
      }

      const parsedJSON = JSON.parse(result.text || "{}");
      res.json(parsedJSON);

    } catch (error: any) {
      console.error("Gemini Parse Error:", error);
      res.status(500).json({ error: error?.message || "Erro ao processar as informações através da IA." });
    }
  });

  // API Route: Public CNPJ lookup with fallback (BrasilAPI -> publica.cnpj.ws)
  app.get("/api/cnpj/:cnpj", async (req, res) => {
    try {
      const { cnpj } = req.params;
      const cnpjClean = cnpj.replace(/\D/g, "");
      if (cnpjClean.length !== 14) {
        return res.status(400).json({ error: "CNPJ inválido. Forneça um CNPJ com 14 dígitos." });
      }

      console.log(`[CNPJ API] Requesting CNPJ: ${cnpjClean}`);
      const headers = { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" };

      // 1. Try BrasilAPI first
      try {
        const brasilRes = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${cnpjClean}`, { headers });
        if (brasilRes.ok) {
          const bData = await brasilRes.json();
          // Map to unified structure
          const isSimples = bData.opcao_pelo_simples === true;
          const socios = (bData.qsa || []).map((s: any) => ({
            nome: s.nome_socio || "",
            qualificacao_socio: { descricao: s.qualificacao_socio || "" }
          }));
          return res.json({
            razao_social: bData.razao_social || "",
            logradouro: bData.logradouro || "",
            numero: bData.numero || "",
            bairro: bData.bairro || "",
            cep: bData.cep || "",
            municipio: bData.municipio || "",
            uf: bData.uf || "",
            simples: { optante: isSimples ? "Sim" : "Não" },
            estabelecimento: {
              logradouro: bData.logradouro || "",
              numero: bData.numero || "",
              bairro: bData.bairro || "",
              cep: bData.cep || "",
              cidade: { nome: bData.municipio || "" },
              estado: { sigla: bData.uf || "", nome: bData.uf || "" }
            },
            socios
          });
        }
      } catch (bErr) {
        console.warn(`[CNPJ API] BrasilAPI failed for ${cnpjClean}, falling back to publica.cnpj.ws...`);
      }

      // 2. Fallback to publica.cnpj.ws
      const apiResponse = await fetch(`https://publica.cnpj.ws/cnpj/${cnpjClean}`, { headers });

      if (apiResponse.status === 429) {
        return res.status(429).json({
          error: "A API pública do CNPJ excedeu o limite de requisições por minuto. Aguarde um instante e tente novamente."
        });
      }

      if (apiResponse.status === 404) {
        return res.status(404).json({ error: "CNPJ não encontrado na base de dados da Receita Federal." });
      }

      if (!apiResponse.ok) {
        return res.status(apiResponse.status).json({
          error: `Erro ao consultar a API pública de CNPJ (Código ${apiResponse.status}).`
        });
      }

      const data = await apiResponse.json();
      return res.json(data);
    } catch (err: any) {
      console.error("[CNPJ API] Error fetching CNPJ:", err);
      return res.status(500).json({
        error: "Erro de rede ou falha na comunicação com a API de CNPJ."
      });
    }
  });

  // API Route: Extract text from PDF
  app.post("/api/parse-pdf", async (req, res) => {
    try {
      const { pdfBase64 } = req.body;
      if (!pdfBase64) {
        return res.status(400).json({ error: "O conteúdo em base64 do PDF é obrigatório." });
      }

      console.log(`[PDF Parser] Received PDF parsing request...`);
      const buffer = Buffer.from(pdfBase64, 'base64');
      const parsedData = await pdf(buffer);

      return res.json({ text: parsedData.text || "" });
    } catch (err: any) {
      console.error("[PDF Parser] Error parsing PDF:", err);
      return res.status(500).json({
        error: `Erro ao extrair texto do PDF: ${err.message || "Erro desconhecido"}`
      });
    }
  });

  // API Route: Decrypt and parse digital certificates (A1 .pfx / .p12) to extract info
  app.post("/api/parse-certificate", (req, res) => {
    try {
      const { pfxBase64, password } = req.body;
      if (!pfxBase64) {
        return res.status(400).json({ error: "O arquivo em base64 do certificado é obrigatório." });
      }

      console.log(`[Cert Parser] Parsing incoming P12/PFX file...`);
      const pfxDer = Buffer.from(pfxBase64, 'base64').toString('binary');
      const asn1 = forge.asn1.fromDer(pfxDer);
      const p12 = forge.pkcs12.fromPkcs12Asn1(asn1, password || '');

      // Locate certificate bag
      const certBags = p12.getBags({ bagType: forge.pki.oids.certBag });
      const certBag = certBags[forge.pki.oids.certBag]?.[0];
      if (!certBag) {
        throw new Error("Não foi possível encontrar a chave do certificado no arquivo.");
      }

      const cert = certBag.cert;
      const subject = cert.subject.attributes;
      const issuer = cert.issuer.attributes;

      const getAttr = (attrs: any[], name: string) => {
        const found = attrs.find(a => a.name === name || a.shortName === name);
        return found ? found.value : '';
      };

      const commonName = getAttr(subject, 'commonName') || 'Certificado ICP-Brasil';
      const issuerCN = getAttr(issuer, 'commonName') || getAttr(issuer, 'organizationName') || 'AC Soluti (ICP-Brasil)';
      const serialNumber = cert.serialNumber || `SN${Math.floor(Math.random() * 10000000)}`;
      const validTo = cert.validity.notAfter;
      const validFrom = cert.validity.notBefore;

      // Extract CNPJ or CPF if possible from OU or commonName
      let cnpj = '';
      const ouAttr = subject.filter(a => a.name === 'organizationalUnitName' || a.shortName === 'OU');
      ouAttr.forEach(attr => {
        const val = String(attr.value);
        if (val.includes('CNPJ:')) {
          cnpj = val.split('CNPJ:')[1].trim();
        } else {
          const match = val.match(/\d{14}/);
          if (match) cnpj = match[0];
        }
      });

      if (!cnpj) {
        const match = commonName.match(/\d{14}/);
        if (match) cnpj = match[0];
      }

      console.log(`[Cert Parser] Successfully parsed certificate: ${commonName}, Valid Until: ${validTo}`);
      return res.json({
        commonName,
        cnpj,
        issuer: issuerCN,
        serialNumber,
        validTo: validTo.toLocaleDateString('pt-BR'),
        validFrom: validFrom.toLocaleDateString('pt-BR')
      });
    } catch (err: any) {
      console.error("[Cert Parser] Error parsing PFX:", err);
      return res.status(500).json({
        error: `Senha inválida ou certificado corrompido: ${err.message || "Erro desconhecido"}`
      });
    }
  });

  // API Route: Digitally Sign PDF using @signpdf and custom or self-signed certificate
  app.post("/api/sign-pdf", async (req, res) => {
    try {
      const { pdfBase64, companyName, cnpj, customP12Base64, customP12Password } = req.body;
      if (!pdfBase64) {
        return res.status(400).json({ error: "O conteúdo em base64 do PDF é obrigatório." });
      }

      const cleanCompanyName = companyName || "Empresa de Teste Ltda";
      const cleanCnpj = cnpj || "00.000.000/0001-00";

      let p12Buffer: Buffer;
      let passphrase = "password";

      if (customP12Base64) {
        console.log(`[PDF Signer] Signing with CUSTOM client certificate for ${cleanCompanyName}...`);
        p12Buffer = Buffer.from(customP12Base64, "base64");
        passphrase = customP12Password || "";
      } else {
        console.log(`[PDF Signer] No custom certificate provided. Generating self-signed P12 certificate for: ${cleanCompanyName} (CNPJ: ${cleanCnpj})...`);
        p12Buffer = generateSelfSignedP12(cleanCompanyName, cleanCnpj);
      }

      console.log(`[PDF Signer] Loading PDF using pdf-lib...`);
      const pdfDoc = await PDFDocument.load(Buffer.from(pdfBase64, "base64"));

      console.log(`[PDF Signer] Adding signature placeholder...`);
      pdflibAddPlaceholder({
        pdfDoc,
        reason: "Assinatura Digital - Moreira & Lima",
        contactInfo: "contato@moreiralima.com.br",
        name: cleanCompanyName,
        location: "Fortaleza, CE",
        signingTime: new Date(),
        subFilter: "ETSI.CAdES.detached", // Critical for PAdES-BES / ICP-Brasil validation on validar.iti.gov.br
        signatureLength: 32768, // Increased to 32KB to safely accommodate full ICP-Brasil certificate chains
      });

      const pdfWithPlaceholderBytes = await pdfDoc.save();

      console.log(`[PDF Signer] Signing PDF using @signpdf/signpdf with custom ICP-Brasil compliance...`);
      const signpdf = new SignPdf();
      const signer = new CustomP12Signer(p12Buffer, { passphrase });

      const signedPdfBuffer = await signpdf.sign(pdfWithPlaceholderBytes, signer);

      console.log(`[PDF Signer] PDF signed successfully! Returning base64...`);
      return res.json({ signedPdfBase64: signedPdfBuffer.toString("base64") });
    } catch (err: any) {
      console.error("[PDF Signer] Error signing PDF:", err);
      return res.status(500).json({
        error: `Erro ao assinar digitalmente o PDF: ${err.message || "Erro desconhecido"}`
      });
    }
  });

  // Serve static client files in production, use Vite middleware in dev
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on port ${PORT}`);
  });
}

startServer();
