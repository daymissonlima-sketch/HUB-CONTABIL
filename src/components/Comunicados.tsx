import React, { useState, useEffect } from 'react';
import html2pdf from 'html2pdf.js';
import { 
  FileText, Upload, Save, AlertCircle, CheckCircle2, 
  Trash2, FileOutput, Sparkles, ShieldCheck
} from 'lucide-react';
import { saveToIDB, getFromIDB, removeFromIDB } from '../utils/idbStorage';

interface ComunicadoState {
  titulo: string;
  conteudo: string;
  fontFamily: 'times' | 'helvetica';
  fontSize: number;
}

const STORAGE_KEY_STATE = 'comunicados_saved_state_v1';
const STORAGE_KEY_BG = 'comunicados_background_img_v1';

export const Comunicados: React.FC = () => {
  // Estado Principal do Módulo
  const [state, setState] = useState<ComunicadoState>({
    titulo: 'COMUNICADO INSTITUCIONAL / CIRCULAR Nº 01/2026',
    conteudo: `Prezados Clientes e Colaboradores,\n\nInformamos por meio deste comunicado oficial os novos procedimentos de envio e auditoria de documentos fiscais eletrônicos (NF-e e NFC-e) aplicáveis a partir do terceiro trimestre do corrente ano fiscal.\n\nCom o objetivo de aprimorar a conciliação contábil e garantir conformidade integral com as exigências da Secretaria da Fazenda e Receita Federal, solicitamos que todas as transmissões de relatórios CSV do SIGA e arquivos XML sejam realizadas impreterivelmente até o 5º dia útil de cada mês diretamente pelo nosso portal.\n\nAgradecemos a atenção e permanecemos à disposição para eventuais esclarecimentos e suporte técnico.`,
    fontFamily: 'times',
    fontSize: 11
  });

  const [backgroundImg, setBackgroundImg] = useState<string | null>(null);
  const [isSaved, setIsSaved] = useState<boolean>(false);
  const [statusMsg, setStatusMsg] = useState<{ text: string; type: 'success' | 'error' | 'info' } | null>(null);

  // Carregar dados salvos no cache do navegador (IndexedDB para imagens pesadas + LocalStorage)
  useEffect(() => {
    const loadCachedData = async () => {
      try {
        const savedState = localStorage.getItem(STORAGE_KEY_STATE);
        if (savedState) {
          setState(JSON.parse(savedState));
          setIsSaved(true);
        }

        // 1. Prioriza buscar a imagem em HD direto do IndexedDB (suporta imagens pesadas de até 8MB sem erro de quota)
        const cachedBgIDB = await getFromIDB(STORAGE_KEY_BG);
        if (cachedBgIDB && cachedBgIDB.startsWith('data:image')) {
          setBackgroundImg(cachedBgIDB);
          return;
        }

        // 2. Fallback: se estiver no localStorage antigo, carrega e migra para o IndexedDB
        const savedBg = localStorage.getItem(STORAGE_KEY_BG);
        if (savedBg && savedBg.startsWith('data:image')) {
          setBackgroundImg(savedBg);
          await saveToIDB(STORAGE_KEY_BG, savedBg);
          try {
            localStorage.setItem(STORAGE_KEY_BG, 'idb://cached_bg');
          } catch (e) {}
        }
      } catch (error) {
        console.error('Erro ao ler cache no módulo de Comunicados:', error);
      }
    };
    loadCachedData();
  }, []);

  const showFeedback = (text: string, type: 'success' | 'error' | 'info') => {
    setStatusMsg({ text, type });
    setTimeout(() => {
      setStatusMsg(null);
    }, 4500);
  };

  // Upload exclusivo para Papel Timbrado em PNG/JPG
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.includes('image/')) {
      showFeedback('Por favor, envie um arquivo de imagem válido (PNG ou JPG).', 'error');
      return;
    }

    // Limite de 8MB para garantir excelente renderização de fundo sem exceder memória
    if (file.size > 8 * 1024 * 1024) {
      showFeedback('A imagem do papel timbrado deve ter no máximo 8MB.', 'error');
      return;
    }

    const reader = new FileReader();
    reader.onload = async (event) => {
      const result = event.target?.result as string;
      setBackgroundImg(result);
      setIsSaved(false);
      
      // Grava instantaneamente no IndexedDB do navegador assim que o arquivo é selecionado
      await saveToIDB(STORAGE_KEY_BG, result);
      try {
        localStorage.setItem(STORAGE_KEY_BG, 'idb://cached_bg');
      } catch (e) {}

      showFeedback('Papel timbrado gravado em cache de alta capacidade no navegador! Não será necessário enviar novamente.', 'success');
    };
    reader.readAsDataURL(file);
  };

  const removeBackground = async () => {
    setBackgroundImg(null);
    await removeFromIDB(STORAGE_KEY_BG);
    localStorage.removeItem(STORAGE_KEY_BG);
    setIsSaved(false);
    showFeedback('Papel timbrado removido do cache do navegador.', 'info');
  };

  // Tarefa 2: Botão Salvar (Validação + Cache IndexedDB/LocalStorage)
  const handleSave = async () => {
    if (!state.conteudo.trim()) {
      showFeedback('O conteúdo do comunicado não pode estar vazio.', 'error');
      return;
    }

    if (!backgroundImg) {
      // Aviso de segurança conforme solicitado, porém permitindo salvar
      showFeedback('Aviso: Salvo sem papel timbrado de fundo. Recomendamos anexar um PNG timbrado.', 'info');
    }

    try {
      localStorage.setItem(STORAGE_KEY_STATE, JSON.stringify(state));
      if (backgroundImg) {
        await saveToIDB(STORAGE_KEY_BG, backgroundImg);
        try {
          localStorage.setItem(STORAGE_KEY_BG, 'idb://cached_bg');
        } catch (e) {}
      }
      setIsSaved(true);
      showFeedback('Comunicado e papel timbrado salvos com sucesso no cache do navegador!', 'success');
    } catch (error) {
      showFeedback('Erro de armazenamento no navegador.', 'error');
    }
  };

  // Geração de PDF (html2pdf.js)
  const generateHtml2PDF = async () => {
    if (!isSaved && !state.conteudo) {
      showFeedback('Por favor, salve o comunicado antes de gerar o PDF.', 'error');
      return;
    }

    const sourceElement = document.getElementById('comunicado-a4-print-target');
    if (!sourceElement) {
      showFeedback('Elemento alvo para renderização não encontrado.', 'error');
      return;
    }

    showFeedback('Gerando PDF...', 'info');

    // Cria um container temporário anexado diretamente ao document.body na coordenada fixa (0,0)
    // Isso escapa do zoom de 80% do app e de qualquer deslocamento de scroll ou margem negativa
    const printContainer = document.createElement('div');
    printContainer.id = 'temp-pdf-export-container';
    printContainer.style.position = 'fixed';
    printContainer.style.top = '0px';
    printContainer.style.left = '0px';
    printContainer.style.width = '794px';
    printContainer.style.minHeight = '1120px';
    printContainer.style.backgroundColor = '#ffffff';
    printContainer.style.zIndex = '-999999';
    printContainer.style.pointerEvents = 'none';

    const clonedContent = sourceElement.cloneNode(true) as HTMLElement;
    clonedContent.className = 'w-[794px] min-h-[1120px] relative overflow-hidden pointer-events-none';
    clonedContent.style.display = 'block';
    clonedContent.style.position = 'relative';
    clonedContent.style.left = '0px';
    clonedContent.style.top = '0px';
    clonedContent.style.width = '794px';
    clonedContent.style.minHeight = '1120px';
    clonedContent.style.backgroundColor = '#ffffff';

    printContainer.appendChild(clonedContent);
    document.body.appendChild(printContainer);

    // Pequena pausa para o navegador calcular o layout e carregar a imagem de fundo clonada
    await new Promise(resolve => setTimeout(resolve, 150));

    const opt = {
      margin: 0,
      filename: `Comunicado_${new Date().toISOString().slice(0, 10)}.pdf`,
      image: { type: 'jpeg', quality: 1.0 },
      html2canvas: {
        scale: 2,
        useCORS: true,
        letterRendering: true,
        logging: false,
        scrollY: 0,
        scrollX: 0,
        windowWidth: 794,
        onclone: (clonedDoc: Document) => {
          // 1. Injetar folha de estilo de reset em HEX/RGB para sobrescrever regras globais com oklch do Tailwind v4
          const style = clonedDoc.createElement('style');
          style.innerHTML = `
            * {
              border-color: transparent !important;
              outline-color: transparent !important;
              text-decoration-color: transparent !important;
              box-shadow: none !important;
              text-shadow: none !important;
            }
            html, body {
              background-color: #ffffff !important;
              color: #0f172a !important;
            }
          `;
          clonedDoc.head.appendChild(style);

          // 2. Varrer elementos do DOM clonado e neutralizar qualquer cor oklch remanescente em getComputedStyle
          const win = clonedDoc.defaultView;
          if (win) {
            clonedDoc.querySelectorAll('*').forEach((node) => {
              if (node instanceof win.HTMLElement) {
                const comp = win.getComputedStyle(node);
                if (comp) {
                  const props = ['color', 'backgroundColor', 'borderColor', 'borderTopColor', 'borderRightColor', 'borderBottomColor', 'borderLeftColor', 'outlineColor'];
                  props.forEach((prop) => {
                    const val = (comp as any)[prop];
                    if (val && typeof val === 'string' && val.includes('oklch')) {
                      if (prop.toLowerCase().includes('background') || prop.toLowerCase().includes('border') || prop.toLowerCase().includes('outline')) {
                        (node.style as any)[prop] = 'transparent';
                      } else {
                        (node.style as any)[prop] = '#0f172a';
                      }
                    }
                  });
                }
              }
            });
          }
        }
      },
      pagebreak: { mode: ['avoid-all', 'css', 'legacy'] },
      jsPDF: {
        unit: 'mm',
        format: 'a4',
        orientation: 'portrait'
      }
    };

    try {
      await html2pdf()
        .set(opt)
        .from(clonedContent)
        .toPdf()
        .get('pdf')
        .then((pdf: any) => {
          const totalPages = pdf.internal.getNumberOfPages();
          if (totalPages > 1) {
            const contentHeight = clonedContent.scrollHeight;
            // Se a altura total do conteúdo couber nas páginas anteriores com tolerância para subpixels
            if (contentHeight <= (totalPages - 1) * 1125) {
              pdf.deletePage(totalPages);
            }
          }
        })
        .save();
      showFeedback('PDF gerado com sucesso!', 'success');
    } catch (err) {
      console.error('Erro na renderização html2pdf:', err);
      showFeedback('Erro técnico ao gerar PDF.', 'error');
    } finally {
      if (document.body.contains(printContainer)) {
        document.body.removeChild(printContainer);
      }
    }
  };

  return (
    <div className="w-full bg-slate-100/80 rounded-2xl p-6 border border-slate-200/80 shadow-sm animate-fadeIn">
      
      {/* Cabeçalho Técnico Superior */}
      <div className="flex items-center justify-between pb-5 mb-6 border-b border-slate-200 flex-wrap gap-3">
        <div className="flex items-center space-x-3">
          <div className="w-11 h-11 rounded-xl bg-[#04243b] text-[#e4b35e] flex items-center justify-center shadow-md">
            <FileText className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-lg font-black text-[#04243b] tracking-tight uppercase">
              Gerador de Comunicados
            </h1>
          </div>
        </div>

        {/* Painel de Ações Rápidas */}
        <div className="flex items-center space-x-2.5">
          {statusMsg && (
            <div className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center space-x-1.5 animate-fadeIn ${
              statusMsg.type === 'success' ? 'bg-emerald-100 text-emerald-800 border border-emerald-300' :
              statusMsg.type === 'error' ? 'bg-rose-100 text-rose-800 border border-rose-300' :
              'bg-blue-100 text-blue-800 border border-blue-300'
            }`}>
              {statusMsg.type === 'success' ? <CheckCircle2 className="w-3.5 h-3.5" /> : <AlertCircle className="w-3.5 h-3.5" />}
              <span>{statusMsg.text}</span>
            </div>
          )}

          <button
            onClick={handleSave}
            className="flex items-center space-x-1.5 bg-slate-800 hover:bg-slate-900 text-white px-3.5 py-2 rounded-xl text-xs font-bold transition-all shadow-sm cursor-pointer"
          >
            <Save className="w-4 h-4 text-[#e4b35e]" />
            <span>Salvar</span>
          </button>

          <button
            onClick={generateHtml2PDF}
            disabled={!isSaved && !state.conteudo}
            className={`flex items-center space-x-2 px-4 py-2 rounded-xl text-xs font-black transition-all shadow-md cursor-pointer ${
              !isSaved
                ? 'bg-amber-500 hover:bg-amber-600 text-white'
                : 'bg-[#04243b] hover:bg-[#031d30] text-[#e4b35e] border border-[#e4b35e]/30'
            }`}
            title="Gera PDF em alta resolução"
          >
            <FileOutput className="w-4 h-4" />
            <span>Gerar PDF</span>
          </button>
        </div>
      </div>

      {/* Tarefa 1: Dois Painéis Desktop (Esquerda: Editor 5 colunas | Direita: Preview 7 colunas) */}
      <div className="grid grid-cols-12 gap-6 items-start">
        
        {/* PAINEL ESQUERDO: EDITOR TÉCNICO */}
        <div className="col-span-5 bg-white rounded-xl border border-slate-200/90 shadow-sm p-5 space-y-5">
          
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <span className="text-xs font-black uppercase text-[#04243b] flex items-center space-x-2">
              <Sparkles className="w-4 h-4 text-[#e4b35e]" />
              <span>Insira Uma Imagem de Fundo</span>
            </span>
          </div>

          {/* Configuração de Fundo (Papel Timbrado em PNG) */}
          <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-2.5">
            <label className="text-[11px] font-bold text-slate-700 uppercase tracking-wider flex items-center justify-between">
              <span>Papel Timbrado (Fundo PNG/JPG 100%)</span>
              {backgroundImg && (
                <span className="text-emerald-600 font-semibold text-[10px] flex items-center">
                  <ShieldCheck className="w-3 h-3 mr-1 inline" /> Ativo
                </span>
              )}
            </label>

            <div className="flex items-center space-x-2">
              <label className="flex-1 flex items-center justify-center space-x-2 border-2 border-dashed border-slate-300 hover:border-[#04243b] bg-white hover:bg-slate-50/50 py-2.5 px-3 rounded-lg cursor-pointer transition-all">
                <Upload className="w-4 h-4 text-[#04243b]" />
                <span className="text-xs font-bold text-slate-600 truncate">
                  {backgroundImg ? 'Trocar Fundo Timbrado...' : 'Anexar Fundo PNG (Timbrado)'}
                </span>
                <input
                  type="file"
                  accept=".png,.jpg,.jpeg,image/png,image/jpeg"
                  onChange={handleFileUpload}
                  className="hidden"
                />
              </label>

              {backgroundImg && (
                <button
                  onClick={removeBackground}
                  className="p-2.5 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-600 transition-colors"
                  title="Remover Fundo Timbrado"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>

          {/* Opções de Tipografia */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">
                Fonte
              </label>
              <select
                value={state.fontFamily}
                onChange={(e) => {
                  setState({ ...state, fontFamily: e.target.value as 'times' | 'helvetica' });
                  setIsSaved(false);
                }}
                className="w-full bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs font-bold text-[#04243b] focus:outline-none focus:ring-2 focus:ring-[#04243b]"
              >
                <option value="times">Serifada Elegante (Times)</option>
                <option value="helvetica">Padrão Executivo (Sans/Arial)</option>
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">
                Tamanho da Fonte (pt)
              </label>
              <input
                type="number"
                min={9}
                max={16}
                value={state.fontSize}
                onChange={(e) => {
                  setState({ ...state, fontSize: Number(e.target.value) || 11 });
                  setIsSaved(false);
                }}
                className="w-full bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs font-bold text-[#04243b] focus:outline-none focus:ring-2 focus:ring-[#04243b]"
              />
            </div>
          </div>

          {/* Título / Assunto */}
          <div>
            <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">
              Título / Número do Comunicado
            </label>
            <input
              type="text"
              value={state.titulo}
              onChange={(e) => {
                setState({ ...state, titulo: e.target.value });
                setIsSaved(false);
              }}
              placeholder="Ex: COMUNICADO INTERNO Nº 05/2026"
              className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#04243b]"
            />
          </div>

          {/* Entrada de Conteúdo (Textarea de Alta Capacidade com Suporte a Quebra de Linhas) */}
          <div>
            <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">
              Conteúdo do Documento
            </label>
            <textarea
              rows={15}
              value={state.conteudo}
              onChange={(e) => {
                setState({ ...state, conteudo: e.target.value });
                setIsSaved(false);
              }}
              placeholder="Digite ou cole o texto do comunicado..."
              className="w-full bg-slate-50 border border-slate-300 rounded-lg p-3 text-xs leading-relaxed font-normal text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#04243b] resize-y"
            />
          </div>

        </div>

        {/* PAINEL DIREITO: PREVIEW A4 REAL EM TEMPO REAL */}
        <div className="col-span-7 flex flex-col items-center justify-start bg-slate-200/70 p-6 rounded-xl border border-slate-300 min-h-[780px]">
          
          {/* Folha A4 Simulação Visual no Desktop */}
          <div 
            className="w-full max-w-[580px] bg-white rounded-sm shadow-xl border border-slate-300/80 relative overflow-hidden transition-all duration-200"
            style={{
              aspectRatio: '210 / 297',
              paddingTop: '16.8%', // Simula os 5cm (50mm) de topo do cabeçalho timbrado
              paddingBottom: '16.8%', // Simula os 5cm (50mm) inferiores
              paddingLeft: '14.2%', // Simula os 3cm laterais
              paddingRight: '14.2%',
            }}
          >
            {/* Papel Timbrado de Fundo (z-index: 0 ou plano de fundo estrito) */}
            {backgroundImg && (
              <img
                src={backgroundImg}
                alt="Papel Timbrado Fundo"
                className="absolute inset-0 w-full h-full object-cover pointer-events-none select-none opacity-100 z-0"
              />
            )}

            {/* Marca d'água discreta caso não haja fundo timbrado carregado */}
            {!backgroundImg && (
              <div className="absolute top-4 left-0 right-0 flex justify-center pointer-events-none z-0 opacity-20">
                <div className="border-2 border-dashed border-slate-400 px-6 py-2 rounded text-[10px] font-bold tracking-widest uppercase text-slate-600">
                  Espaço reservado para Papel Timbrado PNG (100% Top/Side)
                </div>
              </div>
            )}

            {/* Camada de Texto Sanitizado Sobreposta com Margens de Segurança (z-index: 10) */}
            <div 
              className={`relative z-10 flex flex-col justify-start h-full text-slate-900 ${
                state.fontFamily === 'times' ? 'font-serif' : 'font-sans'
              }`}
              style={{ fontSize: `${state.fontSize * 0.95}px` }}
            >
              <div>
                {/* Título do Comunicado */}
                {state.titulo && (
                  <div className="text-center font-bold tracking-wide text-[#04243b] uppercase mb-6" style={{ fontSize: `${(state.fontSize + 2) * 0.95}px` }}>
                    {state.titulo}
                  </div>
                )}

                {/* Corpo do Comunicado Sanitizado (Contra XSS via React Child Rendering puro) */}
                <div className="space-y-4 text-justify leading-[1.7] text-slate-800">
                  {state.conteudo.split('\n').map((line, idx) => {
                    const trimmed = line.trim();
                    if (!trimmed) return <div key={idx} className="h-2" />;
                    return (
                      <p key={idx} className="indent-6">
                        {trimmed}
                      </p>
                    );
                  })}
                </div>
              </div>
            </div>

          </div>
        </div>

      </div>

      {/* Template Oculto Dedicado para Renderização A4 via html2pdf */}
      <div 
        id="comunicado-a4-print-target"
        className="hidden"
        style={{
          backgroundColor: '#ffffff',
          color: '#0f172a',
          paddingTop: '189px', // 5cm superiores
          paddingBottom: '189px', // 5cm inferiores
          paddingLeft: '113px', // 3cm laterais
          paddingRight: '113px',
          borderColor: 'transparent'
        }}
      >
        {backgroundImg && (
          <img
            src={backgroundImg}
            alt="Papel Timbrado Original HD"
            className="absolute inset-0 w-full h-full object-cover pointer-events-none select-none z-0"
            style={{ borderColor: 'transparent', outline: 'none' }}
          />
        )}

        <div 
          className={`relative z-10 flex flex-col justify-start h-full ${
            state.fontFamily === 'times' ? 'font-serif' : 'font-sans'
          }`}
          style={{ fontSize: `${state.fontSize * 1.33}px`, color: '#0f172a' }}
        >
          {state.titulo && (
            <div className="text-center font-bold tracking-wide uppercase mb-8" style={{ fontSize: `${(state.fontSize + 3) * 1.33}px`, color: '#04243b' }}>
              {state.titulo}
            </div>
          )}

          <div className="space-y-4 text-justify leading-[1.7]" style={{ color: '#1e293b' }}>
            {state.conteudo.split('\n').map((line, idx) => {
              const trimmed = line.trim();
              if (!trimmed) return <div key={idx} className="h-3" />;
              return (
                <p key={idx} className="indent-8" style={{ color: '#1e293b' }}>
                  {trimmed}
                </p>
              );
            })}
          </div>
        </div>
      </div>

    </div>
  );
};
