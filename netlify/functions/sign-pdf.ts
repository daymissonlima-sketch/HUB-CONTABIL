import forge from "node-forge";
import { SignPdf } from "@signpdf/signpdf";
import { P12Signer } from "@signpdf/signer-p12";
import { pdflibAddPlaceholder } from "@signpdf/placeholder-pdf-lib";
import { PDFDocument } from "pdf-lib";

function generateSelfSignedP12(companyName: string, cnpj: string): Buffer {
  const keys = forge.pki.rsa.generateKeyPair(2048);
  const cert = forge.pki.createCertificate();
  cert.publicKey = keys.publicKey;
  cert.serialNumber = "01";
  cert.validity.notBefore = new Date();
  cert.validity.notAfter = new Date();
  cert.validity.notAfter.setFullYear(cert.validity.notBefore.getFullYear() + 10);

  const attrs = [
    { name: "commonName", value: companyName },
    { name: "countryName", value: "BR" },
    { name: "organizationName", value: companyName },
    { name: "organizationalUnitName", value: cnpj ? `CNPJ: ${cnpj}` : "Contabilidade" },
  ];
  cert.setSubject(attrs);
  cert.setIssuer(attrs);

  cert.sign(keys.privateKey, forge.md.sha256.create());

  const p12Asn1 = forge.pkcs12.toPkcs12Asn1(keys.privateKey, [cert], "password", { algorithm: "3des" });
  const p12Der = forge.asn1.toDer(p12Asn1).getBytes();
  return Buffer.from(p12Der, "binary");
}

class CustomP12Signer extends P12Signer {
  async sign(pdfBuffer: Buffer, signingTime: Date | undefined = undefined): Promise<Buffer> {
    if (!(pdfBuffer instanceof Buffer)) {
      throw new Error("PDF expected as Buffer.");
    }

    const options = (this as any).options;
    const cert = (this as any).cert;

    const p12Asn1 = forge.asn1.fromDer(cert);
    const p12 = forge.pkcs12.pkcs12FromAsn1(p12Asn1, options.asn1StrictParsing, options.passphrase);

    const certBags = p12.getBags({ bagType: forge.pki.oids.certBag })[forge.pki.oids.certBag];
    const keyBags = p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag })[forge.pki.oids.pkcs8ShroudedKeyBag];

    if (!keyBags || keyBags.length === 0) {
      throw new Error("Failed to find private key bags in PFX/P12.");
    }
    const privateKey = keyBags[0].key;

    const p7 = forge.pkcs7.createSignedData();
    p7.content = forge.util.createBuffer(pdfBuffer.toString("binary"));

    let certificate: any;
    if (certBags) {
      Object.keys(certBags).forEach((i) => {
        const { publicKey } = certBags[i].cert;
        p7.addCertificate(certBags[i].cert);

        if (privateKey.n.compareTo(publicKey.n) === 0 && privateKey.e.compareTo(publicKey.e) === 0) {
          certificate = certBags[i].cert;
        }
      });
    }

    if (!certificate) {
      throw new Error("Failed to find a certificate that matches the private key.");
    }

    const certDer = forge.asn1.toDer(forge.pki.certificateToAsn1(certificate)).getBytes();
    const md = forge.md.sha256.create();
    md.update(certDer, "binary");
    const certHash = md.digest().getBytes();

    const signingCertificateV2Attr = {
      type: "1.2.840.113549.1.9.16.2.47",
      value: [
        forge.asn1.create(forge.asn1.Class.UNIVERSAL, forge.asn1.Type.SEQUENCE, true, [
          forge.asn1.create(forge.asn1.Class.UNIVERSAL, forge.asn1.Type.SEQUENCE, true, [
            forge.asn1.create(forge.asn1.Class.UNIVERSAL, forge.asn1.Type.SEQUENCE, true, [
              forge.asn1.create(forge.asn1.Class.UNIVERSAL, forge.asn1.Type.SEQUENCE, true, [
                forge.asn1.create(forge.asn1.Class.UNIVERSAL, forge.asn1.Type.OID, false, forge.asn1.oidToDer("2.16.840.1.101.3.4.2.1").getBytes()),
                forge.asn1.create(forge.asn1.Class.UNIVERSAL, forge.asn1.Type.NULL, false, ""),
              ]),
              forge.asn1.create(forge.asn1.Class.UNIVERSAL, forge.asn1.Type.OCTETSTRING, false, certHash),
            ]),
          ]),
        ]),
      ],
    };

    p7.addSigner({
      key: privateKey,
      certificate,
      digestAlgorithm: forge.pki.oids.sha256,
      authenticatedAttributes: [
        { type: forge.pki.oids.contentType, value: forge.pki.oids.data },
        { type: forge.pki.oids.signingTime, value: signingTime ?? new Date() },
        { type: forge.pki.oids.messageDigest },
        signingCertificateV2Attr,
      ],
    });

    p7.sign({ detached: true });
    return Buffer.from(forge.asn1.toDer(p7.toAsn1()).getBytes(), "binary");
  }
}

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
    const { pdfBase64, companyName, cnpj, customP12Base64, customP12Password } = payload;

    if (!pdfBase64) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ error: "O conteúdo em base64 do PDF é obrigatório." }),
      };
    }

    const cleanCompanyName = companyName || "Empresa de Teste Ltda";
    const cleanCnpj = cnpj || "00.000.000/0001-00";

    let p12Buffer: Buffer;
    let passphrase = "password";

    if (customP12Base64) {
      p12Buffer = Buffer.from(customP12Base64, "base64");
      passphrase = customP12Password || "";
    } else {
      p12Buffer = generateSelfSignedP12(cleanCompanyName, cleanCnpj);
    }

    const pdfDoc = await PDFDocument.load(Buffer.from(pdfBase64, "base64"));
    pdflibAddPlaceholder({
      pdfDoc,
      reason: "Assinatura Digital - Moreira & Lima",
      contactInfo: "contato@moreiralima.com.br",
      name: cleanCompanyName,
      location: "Fortaleza, CE",
      signingTime: new Date(),
      subFilter: "ETSI.CAdES.detached",
      signatureLength: 32768,
    });

    const pdfWithPlaceholderBytes = await pdfDoc.save();
    const signpdf = new SignPdf();
    const signer = new CustomP12Signer(p12Buffer, { passphrase });

    const signedPdfBuffer = await signpdf.sign(pdfWithPlaceholderBytes, signer);

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({ signedPdfBase64: signedPdfBuffer.toString("base64") }),
    };
  } catch (err: any) {
    console.error("Netlify PDF Signer Error:", err);
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({
        error: `Erro ao assinar digitalmente o PDF: ${err.message || "Erro desconhecido"}`,
      }),
    };
  }
};
