/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export const MOCK_NFES: string[] = [
  // XML 1: Material de Escritório
  `<?xml version="1.0" encoding="UTF-8"?>
  <nfeProc xmlns="http://www.portalfiscal.inf.br/nfe" versao="4.00">
    <NFe>
      <infNFe Id="NFe35260600123456789012550010000001231000001234" versao="4.00">
        <ide>
          <cUF>35</cUF>
          <cNF>00001234</cNF>
          <natOp>VENDA DE MERCADORIA ADQUIRIDA DE TERCEIROS</natOp>
          <mod>55</mod>
          <serie>1</serie>
          <nNF>123</nNF>
          <dhEmi>2026-06-15T10:14:22-03:00</dhEmi>
          <tpNF>1</tpNF>
        </ide>
        <emit>
          <CNPJ>12345678000190</CNPJ>
          <xNome>TECNOSOLUCOES LTDA</xNome>
          <xFant>TECNOSOLUCOES</xFant>
          <IE>111222333444</IE>
          <CRT>3</CRT>
        </emit>
        <dest>
          <CNPJ>98765432000110</CNPJ>
          <xNome>COMERCIO DE PAPEIS BRASIL LTDA</xNome>
          <IE>555666777888</IE>
        </dest>
        <det nItem="1">
          <prod>
            <cProd>PROD001</cProd>
            <cEAN>7891000123456</cEAN>
            <xProd>PAPEL A4 SULFITE PREMIUM - CAIXA COM 5 RESMAS</xProd>
            <NCM>48025610</NCM>
            <CFOP>5102</CFOP>
            <uCom>CX</uCom>
            <qCom>10.0000</qCom>
            <vUnCom>35.0000</vUnCom>
            <vProd>350.00</vProd>
          </prod>
          <imposto>
            <ICMS>
              <ICMS00>
                <orig>0</orig>
                <CST>00</CST>
                <vBC>350.00</vBC>
                <pICMS>18.00</pICMS>
                <vICMS>63.00</vICMS>
              </ICMS00>
            </ICMS>
            <PIS>
              <PISAliq>
                <CST>01</CST>
                <vBC>350.00</vBC>
                <pPIS>1.65</pPIS>
                <vPIS>5.78</vPIS>
              </PISAliq>
            </PIS>
            <COFINS>
              <COFINSAliq>
                <CST>01</CST>
                <vBC>350.00</vBC>
                <pCOFINS>7.60</pCOFINS>
                <vCOFINS>26.60</vCOFINS>
              </COFINSAliq>
            </COFINS>
          </imposto>
        </det>
        <det nItem="2">
          <prod>
            <cProd>PROD002</cProd>
            <cEAN>7891000123457</cEAN>
            <xProd>CANETA ESFEROGRAFICA AZUL - PACOTE C/ 50 UN</xProd>
            <NCM>96081000</NCM>
            <CFOP>5102</CFOP>
            <uCom>PCT</uCom>
            <qCom>5.0000</qCom>
            <vUnCom>42.5000</vUnCom>
            <vProd>212.50</vProd>
          </prod>
          <imposto>
            <ICMS>
              <ICMS00>
                <orig>0</orig>
                <CST>00</CST>
                <vBC>212.50</vBC>
                <pICMS>18.00</pICMS>
                <vICMS>38.25</vICMS>
              </ICMS00>
            </ICMS>
            <PIS>
              <PISAliq>
                <CST>01</CST>
                <vBC>212.50</vBC>
                <pPIS>1.65</pPIS>
                <vPIS>3.51</vPIS>
              </PISAliq>
            </PIS>
            <COFINS>
              <COFINSAliq>
                <CST>01</CST>
                <vBC>212.50</vBC>
                <pCOFINS>7.60</pCOFINS>
                <vCOFINS>16.15</vCOFINS>
              </COFINSAliq>
            </COFINS>
          </imposto>
        </det>
        <infAdic>
          <infCpl>VALOR TOTAL DOS TRIBUTOS FEDERAIS R$ 52,04 E ESTADUAIS R$ 101,25. DUPLICATA COM VENCIMENTO EM 15/07/2026.</infCpl>
          <infAdFisco>ICMS RECOLHIDO POR SUBSTITUICAO CONFORME CONVENIO 110/08</infAdFisco>
        </infAdic>
      </infNFe>
    </NFe>
  </nfeProc>`,

  // XML 2: Equipamento de TI
  `<?xml version="1.0" encoding="UTF-8"?>
  <nfeProc xmlns="http://www.portalfiscal.inf.br/nfe" versao="4.00">
    <NFe>
      <infNFe Id="NFe35260688888888888888550010000004561000004567" versao="4.00">
        <ide>
          <cUF>35</cUF>
          <cNF>00004567</cNF>
          <natOp>VENDA INTERESTADUAL</natOp>
          <mod>55</mod>
          <serie>2</serie>
          <nNF>456</nNF>
          <dhEmi>2026-06-18T14:30:00-03:00</dhEmi>
          <tpNF>1</tpNF>
        </ide>
        <emit>
          <CNPJ>23456789000101</CNPJ>
          <xNome>INFORTECH DISTRIBUIDORA S/A</xNome>
          <xFant>INFORTECH</xFant>
          <IE>222333444555</IE>
          <CRT>3</CRT>
        </emit>
        <dest>
          <CNPJ>87654321000120</CNPJ>
          <xNome>SOLUCOES WEB BRASIL S/S</xNome>
          <IE>666777888999</IE>
        </dest>
        <det nItem="1">
          <prod>
            <cProd>TI010</cProd>
            <cEAN>7892000456789</cEAN>
            <xProd>MONITOR LED 24 POLEGADAS IPS ULTRASLIM</xProd>
            <NCM>85285220</NCM>
            <CFOP>6102</CFOP>
            <uCom>UN</uCom>
            <qCom>3.0000</qCom>
            <vUnCom>850.0000</vUnCom>
            <vProd>2550.00</vProd>
          </prod>
          <imposto>
            <ICMS>
              <ICMS00>
                <orig>0</orig>
                <CST>00</CST>
                <vBC>2550.00</vBC>
                <pICMS>12.00</pICMS>
                <vICMS>306.00</vICMS>
              </ICMS00>
            </ICMS>
            <PIS>
              <PISAliq>
                <CST>01</CST>
                <vBC>2550.00</vBC>
                <pPIS>1.65</pPIS>
                <vPIS>42.08</vPIS>
              </PISAliq>
            </PIS>
            <COFINS>
              <COFINSAliq>
                <CST>01</CST>
                <vBC>2550.00</vBC>
                <pCOFINS>7.60</pCOFINS>
                <vCOFINS>193.80</vCOFINS>
              </COFINSAliq>
            </COFINS>
          </imposto>
        </det>
        <det nItem="2">
          <prod>
            <cProd>TI025</cProd>
            <cEAN>7892000456790</cEAN>
            <xProd>TECLADO MECANICO GAMER RGB SILENT SWITCH</xProd>
            <NCM>84716052</NCM>
            <CFOP>6102</CFOP>
            <uCom>UN</uCom>
            <qCom>4.0000</qCom>
            <vUnCom>299.0000</vUnCom>
            <vProd>1196.00</vProd>
          </prod>
          <imposto>
            <ICMS>
              <ICMS00>
                <orig>0</orig>
                <CST>00</CST>
                <vBC>1196.00</vBC>
                <pICMS>12.00</pICMS>
                <vICMS>143.52</vICMS>
              </ICMS00>
            </ICMS>
            <PIS>
              <PISAliq>
                <CST>01</CST>
                <vBC>1196.00</vBC>
                <pPIS>1.65</pPIS>
                <vPIS>19.73</vPIS>
              </PISAliq>
            </PIS>
            <COFINS>
              <COFINSAliq>
                <CST>01</CST>
                <vBC>1196.00</vBC>
                <pCOFINS>7.60</pCOFINS>
                <vCOFINS>90.90</vCOFINS>
              </COFINSAliq>
            </COFINS>
          </imposto>
        </det>
        <infAdic>
          <infCpl>ISENCAO PARCIAL CONFORME ARTIGO 15 DO REGULAMENTO ESTADUAL. MERCADORIA DESTINADA AO USO E CONSUMO.</infCpl>
          <infAdFisco>RECOLHIMENTO DE DIFAL DEVE SER EFETUADO PELO DESTINATARIO</infAdFisco>
        </infAdic>
      </infNFe>
    </NFe>
  </nfeProc>`,

  // XML 3: Insumos de Produção Industriais
  `<?xml version="1.0" encoding="UTF-8"?>
  <nfeProc xmlns="http://www.portalfiscal.inf.br/nfe" versao="4.00">
    <NFe>
      <infNFe Id="NFe35260699999999999999550010000007891000007890" versao="4.00">
        <ide>
          <cUF>35</cUF>
          <cNF>00007890</cNF>
          <natOp>VENDA DE PRODUCAO DO ESTABELECIMENTO</natOp>
          <mod>55</mod>
          <serie>1</serie>
          <nNF>789</nNF>
          <dhEmi>2026-06-22T08:45:00-03:00</dhEmi>
          <tpNF>1</tpNF>
        </ide>
        <emit>
          <CNPJ>34567890000112</CNPJ>
          <xNome>METALURGICA INDUSTRIAL DO SUL LTDA</xNome>
          <xFant>METALURGICA SUL</xFant>
          <IE>333444555666</IE>
          <CRT>3</CRT>
        </emit>
        <dest>
          <CNPJ>76543210000130</CNPJ>
          <xNome>FABRICA DE ESTRUTURAS METALICAS S/A</xNome>
          <IE>777888999000</IE>
        </dest>
        <det nItem="1">
          <prod>
            <cProd>MET-003</cProd>
            <cEAN>7893000789012</cEAN>
            <xProd>CHAPA DE ACO CARBONO GALV 3MM X 1200MM</xProd>
            <NCM>72085100</NCM>
            <CFOP>5101</CFOP>
            <uCom>UN</uCom>
            <qCom>15.0000</qCom>
            <vUnCom>450.0000</vUnCom>
            <vProd>6750.00</vProd>
          </prod>
          <imposto>
            <ICMS>
              <ICMS00>
                <orig>0</orig>
                <CST>00</CST>
                <vBC>6750.00</vBC>
                <pICMS>18.00</pICMS>
                <vICMS>1215.00</vICMS>
              </ICMS00>
            </ICMS>
            <PIS>
              <PISAliq>
                <CST>01</CST>
                <vBC>6750.00</vBC>
                <pPIS>1.65</pPIS>
                <vPIS>111.38</vPIS>
              </PISAliq>
            </PIS>
            <COFINS>
              <COFINSAliq>
                <CST>01</CST>
                <vBC>6750.00</vBC>
                <pCOFINS>7.60</pCOFINS>
                <vCOFINS>513.00</vCOFINS>
              </COFINSAliq>
            </COFINS>
          </imposto>
        </det>
        <infAdic>
          <infCpl>PRODUTO INDUSTRIALIZADO DESTINADO A PROCESSO DE MANUFATURA ADICIONAL.</infCpl>
          <infAdFisco>DEMAIS REQUISITOS SEGUNDO REGULAMENTO CONFAZ 50/19</infAdFisco>
        </infAdic>
      </infNFe>
    </NFe>
  </nfeProc>`
];
