#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Script de Integração SEFAZ DFe com TadaSoftware / PyNFe
Consulta e distribuição de Documentos Fiscais Eletrônicos (NFeDistribuicaoDFe)

Instalação das dependências necessárias no seu ambiente Python:
    pip install pynfe lxml cryptography requests

Uso via linha de comando:
    python scripts/pynfe_distdfe.py --cnpj 12345678000190 --pfx caminho/cert.pfx --senha 123456 --nsu 0 --uf CE
"""

import sys
import os
import argparse
import json
import base64
import gzip

try:
    from pynfe.processamento.comunicacao import ComunicacaoSefaz
    from pynfe.entidades.cliente import CertificadoA1
    PYNFE_DISPONIVEL = True
except ImportError:
    PYNFE_DISPONIVEL = False

def consultar_sefaz_pynfe(cnpj, pfx_path, senha, ult_nsu="0", uf="CE", homologacao=False):
    """
    Executa a consulta de distribuição de DF-e na SEFAZ Nacional utilizando o PyNFe
    """
    if not PYNFE_DISPONIVEL:
        return {
            "sucesso": False,
            "erro": "Biblioteca PyNFe não encontrada. Instale com: pip install pynfe lxml cryptography"
        }

    clean_cnpj = "".join(filter(str.isdigit, cnpj))
    if not os.path.exists(pfx_path):
        return {"sucesso": False, "erro": f"Arquivo de certificado não encontrado: {pfx_path}"}

    try:
        # Carrega o certificado digital A1 (.pfx / .p12)
        cert = CertificadoA1(pfx_path, senha)

        # Inicializa o comunicador SEFAZ para a UF informada
        con = ComunicacaoSefaz(uf=uf.upper(), certificado=cert, homologacao=homologacao)

        # Executa a chamada do Webservice NFeDistribuicaoDFe
        # tpAmb: 1 = Produção, 2 = Homologação
        ambiente = 2 if homologacao else 1
        resposta = con.consulta_distribuicao_dfe(
            cnpj=clean_cnpj,
            ult_nsu=str(ult_nsu).zfill(15),
            ambiente=ambiente
        )

        docs_processados = []
        for doc in getattr(resposta, 'documentos', []):
            docs_processados.append({
                "nsu": getattr(doc, 'nsu', ''),
                "schema": getattr(doc, 'schema', ''),
                "chave": getattr(doc, 'chave', ''),
                "xml": getattr(doc, 'xml_string', '')
            })

        return {
            "sucesso": True,
            "cStat": getattr(resposta, 'cStat', '138'),
            "xMotivo": getattr(resposta, 'xMotivo', 'Consulta realizada com sucesso'),
            "ultNSU": getattr(resposta, 'ultNSU', str(ult_nsu)),
            "maxNSU": getattr(resposta, 'maxNSU', str(ult_nsu)),
            "totalDocs": len(docs_processados),
            "documentos": docs_processados
        }
    except Exception as e:
        return {
            "sucesso": False,
            "erro": str(e)
        }

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description="Consulta SEFAZ NFeDistribuicaoDFe com PyNFe")
    parser.add_argument('--cnpj', required=True, help="CNPJ da empresa consultante (apenas dígitos)")
    parser.add_argument('--pfx', required=True, help="Caminho do arquivo de certificado digital A1 (.pfx/.p12)")
    parser.add_argument('--senha', required=True, help="Senha do certificado digital")
    parser.add_argument('--nsu', default="0", help="Último NSU consultado (padrão: 0)")
    parser.add_argument('--uf', default="CE", help="UF autora (padrão: CE)")
    parser.add_argument('--homologacao', action='store_true', help="Usar ambiente de homologação")

    args = parser.parse_args()

    res = consultar_sefaz_pynfe(
        cnpj=args.cnpj,
        pfx_path=args.pfx,
        senha=args.senha,
        ult_nsu=args.nsu,
        uf=args.uf,
        homologacao=args.homologacao
    )

    print(json.dumps(res, indent=2, ensure_ascii=False))
