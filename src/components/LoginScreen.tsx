/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Tela de Login Corporativo e Painel Administrativo de Gestão de Funcionários
 * - Acesso restrito e exclusivo para funcionários e Gerente Master
 * - Autenticação estritamente por E-mail e Senha (sem login social com Google)
 * - Criação de novos acessos restrita exclusivamente ao Gerente Master
 * - Disparo automático de e-mail com link oficial de criação/redefinição de senha
 * - Edição completa e exclusão de funcionários pelo Gerente Master
 */

import React, { useState, useEffect } from 'react';
import {
  Lock,
  Mail,
  User as UserIcon,
  LogIn,
  UserPlus,
  KeyRound,
  AlertCircle,
  CheckCircle2,
  Users,
  Trash2,
  Ban,
  Check,
  X,
  RefreshCw,
  Edit2,
  Send,
  ArrowLeft,
  Shield,
  HelpCircle,
  Eye,
  EyeOff,
} from 'lucide-react';
import {
  signInWithEmail,
  registerUserWithEmail,
  sendPasswordReset,
  signOutFirebase,
} from '../firebase';
import {
  FirebaseSyncStatus,
  OfficeUser,
  isMasterAdminEmail,
  sanitizeEmailToKey,
  adminCadastrarFuncionarioComLink,
  adminEditarFuncionario,
  adminReenviarLinkSenha,
  adminExcluirFuncionario,
  alterarSenhaUsuario,
  getRuntimeOfficeUsers,
  OFFICE_USERS_UPDATED_EVENT,
} from '../services/firebaseSyncService';

const SESSION_UNLOCKED_KEY = 'moreira_lima_session_unlocked_uid';

interface LoginScreenProps {
  syncStatus: FirebaseSyncStatus;
  onAuthenticated: () => void;
}

export function LoginScreen({ syncStatus, onAuthenticated }: LoginScreenProps) {
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Modo: Esqueci minha senha / Recuperação de acesso
  const [isForgotMode, setIsForgotMode] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotLoading, setForgotLoading] = useState(false);
  const [forgotFeedback, setForgotFeedback] = useState<{
    type: 'ok' | 'err';
    text: string;
  } | null>(null);

  // Modo: Troca obrigatória de senha no primeiro acesso
  const [mustChangePasswordMode, setMustChangePasswordMode] = useState(false);
  const [novaSenha, setNovaSenha] = useState('');
  const [confirmarNovaSenha, setConfirmarNovaSenha] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showNovaSenha, setShowNovaSenha] = useState(false);

  const firebaseUser = syncStatus.user;
  const officeProfile = syncStatus.officeProfile;
  const isMaster =
    isMasterAdminEmail(firebaseUser?.email) ||
    firebaseUser?.uid === 'cQNrcS8yObVRBT2OhtVXkVz7yc72';

  // Se a sessão já foi validada neste navegador e o usuário continua ativo
  useEffect(() => {
    if (!firebaseUser) return;
    if (officeProfile?.status === 'BLOQUEADO' && !isMaster) {
      setErrorMsg('Seu acesso está bloqueado pelo Administrador.');
      signOutFirebase();
      return;
    }

    const unlockedUid = sessionStorage.getItem(SESSION_UNLOCKED_KEY);
    if (unlockedUid === firebaseUser.uid && (officeProfile || isMaster)) {
      if (!officeProfile?.deveAlterarSenha) {
        onAuthenticated();
      } else {
        setMustChangePasswordMode(true);
      }
    }
  }, [firebaseUser, officeProfile, isMaster, onAuthenticated]);

  // Submissão do Login Principal (E-mail e Senha)
  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    const emailLimpo = email.trim().toLowerCase();
    const senhaLimpa = senha.trim();

    if (!emailLimpo || !emailLimpo.includes('@')) {
      setErrorMsg('Informe um endereço de e-mail válido.');
      return;
    }

    if (!senhaLimpa) {
      setErrorMsg('Digite sua senha de acesso.');
      return;
    }

    setLoading(true);
    try {
      let loggedUser = null;

      try {
        const cred = await signInWithEmail(emailLimpo, senhaLimpa);
        loggedUser = cred.user;
      } catch (authErr: any) {
        const errCode = authErr?.code || '';

        // Se for o usuário Master e ainda não tiver sido registrado no Firebase Auth
        if (
          isMasterAdminEmail(emailLimpo) &&
          (errCode === 'auth/user-not-found' ||
            errCode === 'auth/invalid-credential' ||
            errCode === 'auth/wrong-password')
        ) {
          try {
            // Tenta registrar o master diretamente com a senha informada
            const newCred = await registerUserWithEmail(emailLimpo, senhaLimpa);
            loggedUser = newCred.user;
          } catch (regErr: any) {
            if (regErr?.code === 'auth/email-already-in-use') {
              throw new Error(
                'Senha incorreta para o Gerente Master. Se esqueceu sua senha, clique em "Esqueceu sua senha?" abaixo para receber o link de redefinição.'
              );
            }
            throw authErr;
          }
        } else if (
          errCode === 'auth/user-not-found' ||
          errCode === 'auth/invalid-credential' ||
          errCode === 'auth/wrong-password'
        ) {
          throw new Error(
            'E-mail ou senha incorretos. Apenas usuários previamente autorizados pelo Gerente Master possuem acesso. Se esqueceu sua senha, use a opção "Esqueceu sua senha?".'
          );
        } else if (errCode === 'auth/too-many-requests') {
          throw new Error(
            'Muitas tentativas sem sucesso. Aguarde alguns instantes ou redefina sua senha.'
          );
        } else {
          throw authErr;
        }
      }

      if (loggedUser) {
        sessionStorage.setItem(SESSION_UNLOCKED_KEY, loggedUser.uid);
        setSuccessMsg('Acesso autenticado com sucesso! Carregando painel...');
        setTimeout(() => {
          onAuthenticated();
        }, 500);
      }
    } catch (err: any) {
      setErrorMsg(err?.message || 'Falha na autenticação. Verifique suas credenciais.');
    } finally {
      setLoading(false);
    }
  };

  // Submissão da Recuperação de Senha
  const handleForgotSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setForgotFeedback(null);

    const emailLimpo = forgotEmail.trim().toLowerCase();
    if (!emailLimpo || !emailLimpo.includes('@')) {
      setForgotFeedback({
        type: 'err',
        text: 'Informe um e-mail válido para envio do link.',
      });
      return;
    }

    setForgotLoading(true);
    try {
      await sendPasswordReset(emailLimpo);
      setForgotFeedback({
        type: 'ok',
        text: `Link enviado com sucesso para ${emailLimpo}! Verifique sua caixa de entrada e pasta de spam para cadastrar sua nova senha.`,
      });
    } catch (err: any) {
      const code = err?.code || '';
      if (code === 'auth/user-not-found') {
        setForgotFeedback({
          type: 'err',
          text: 'Este e-mail não possui cadastro no sistema. Solicite ao Gerente Master para criar seu usuário.',
        });
      } else {
        setForgotFeedback({
          type: 'err',
          text: err?.message || 'Erro ao enviar e-mail de recuperação. Tente novamente.',
        });
      }
    } finally {
      setForgotLoading(false);
    }
  };

  // Submissão de Troca Obrigatória de Senha
  const handleChangePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    if (!firebaseUser) {
      setErrorMsg('Sessão expirada. Faça login novamente.');
      return;
    }

    if (novaSenha.trim().length < 6) {
      setErrorMsg('A nova senha deve ter no mínimo 6 caracteres.');
      return;
    }

    if (novaSenha !== confirmarNovaSenha) {
      setErrorMsg('A confirmação da nova senha não confere.');
      return;
    }

    setLoading(true);
    try {
      const emailKey =
        officeProfile?.emailKey || sanitizeEmailToKey(firebaseUser.email || '');
      await alterarSenhaUsuario({
        emailKey,
        novaSenha: novaSenha.trim(),
      });

      sessionStorage.setItem(SESSION_UNLOCKED_KEY, firebaseUser.uid);
      setSuccessMsg('Senha pessoal cadastrada com sucesso! Entrando...');
      setTimeout(() => {
        onAuthenticated();
      }, 700);
    } catch (err: any) {
      setErrorMsg(err?.message || 'Erro ao atualizar a nova senha.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#04243b] flex flex-col justify-center items-center p-4 select-none">
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-2xl border border-[#e4b35e]/30 overflow-hidden">
        {/* Cabeçalho Institucional Moreira & Lima */}
        <div className="bg-[#031d30] px-6 py-6 border-b border-[#e4b35e]/25 flex flex-col items-center text-center">
          <div className="inline-flex items-center gap-2 mb-2">
            <span className="px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-[0.2em] bg-[#e4b35e]/15 text-[#e4b35e] border border-[#e4b35e]/30">
              MY HUB
            </span>
            <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-300">
              Acesso Restrito
            </span>
          </div>
          <h1 className="text-xl font-extrabold text-white tracking-tight">
            Moreira &amp; Lima
          </h1>
          <p className="text-[11px] font-medium tracking-wider text-[#e4b35e] uppercase mt-1">
            Gestão Contábil e Tributária
          </p>
        </div>

        <div className="p-6">
          {/* MODO 1: Troca Obrigatória de Senha */}
          {mustChangePasswordMode ? (
            <form onSubmit={handleChangePasswordSubmit} className="space-y-4">
              <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs flex items-start gap-2.5">
                <KeyRound className="h-5 w-5 text-amber-700 shrink-0 mt-0.5" />
                <div>
                  <p className="font-bold text-[12px]">Primeiro Acesso ao Sistema</p>
                  <p className="text-[11px] text-amber-800 leading-snug mt-0.5">
                    Defina sua nova senha pessoal para concluir a ativação da sua conta.
                  </p>
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">
                  Nova Senha (mínimo 6 dígitos)
                </label>
                <div className="relative">
                  <Lock className="h-4 w-4 text-slate-400 absolute left-3 top-2.5" />
                  <input
                    type="password"
                    required
                    autoFocus
                    value={novaSenha}
                    onChange={e => setNovaSenha(e.target.value)}
                    placeholder="Digite sua senha definitiva"
                    className="w-full pl-9 pr-3 py-2 text-xs border border-slate-300 rounded-xl focus:outline-none focus:border-[#04243b]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">
                  Confirmar Nova Senha
                </label>
                <div className="relative">
                  <Lock className="h-4 w-4 text-slate-400 absolute left-3 top-2.5" />
                  <input
                    type="password"
                    required
                    value={confirmarNovaSenha}
                    onChange={e => setConfirmarNovaSenha(e.target.value)}
                    placeholder="Repita a nova senha"
                    className="w-full pl-9 pr-3 py-2 text-xs border border-slate-300 rounded-xl focus:outline-none focus:border-[#04243b]"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 px-4 rounded-xl bg-[#04243b] hover:bg-[#063354] text-[#e4b35e] font-bold text-xs flex items-center justify-center gap-2 shadow-md transition-all cursor-pointer disabled:opacity-50"
              >
                {loading ? (
                  <RefreshCw className="h-4 w-4 animate-spin" />
                ) : (
                  <CheckCircle2 className="h-4 w-4" />
                )}
                <span>Salvar Nova Senha e Acessar</span>
              </button>
            </form>
          ) : isForgotMode ? (
            /* MODO 2: Recuperação de Senha por E-mail (Conforme especificação do usuário) */
            <form onSubmit={handleForgotSubmit} className="space-y-4">
              <div className="text-center space-y-1">
                <h2 className="text-sm font-bold text-slate-800">Recuperar Acesso</h2>
                <p className="text-[11px] text-slate-500 leading-relaxed">
                  Digite seu e-mail cadastrado. Enviaremos um link seguro para você definir sua nova senha.
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  E-mail
                </label>
                <input
                  type="email"
                  required
                  autoFocus
                  value={forgotEmail}
                  onChange={e => setForgotEmail(e.target.value)}
                  placeholder="seu.email@moreiraelima.com.br"
                  className="w-full px-3 py-2.5 text-xs border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600"
                />
              </div>

              <button
                type="submit"
                disabled={forgotLoading}
                className="w-full py-2.5 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs flex items-center justify-center gap-2 shadow-sm transition-all cursor-pointer disabled:opacity-50"
              >
                {forgotLoading ? (
                  <RefreshCw className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-3.5 w-3.5" />
                )}
                <span>Enviar link de recuperação</span>
              </button>

              {forgotFeedback && (
                <div
                  className={`p-3 rounded-xl text-xs flex items-start gap-2 ${
                    forgotFeedback.type === 'ok'
                      ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                      : 'bg-red-50 text-red-700 border border-red-200'
                  }`}
                >
                  {forgotFeedback.type === 'ok' ? (
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600 mt-0.5" />
                  ) : (
                    <AlertCircle className="h-4 w-4 shrink-0 text-red-600 mt-0.5" />
                  )}
                  <span className="leading-snug">{forgotFeedback.text}</span>
                </div>
              )}

              <div className="text-center pt-1">
                <button
                  type="button"
                  onClick={() => {
                    setIsForgotMode(false);
                    setForgotFeedback(null);
                  }}
                  className="text-xs text-blue-600 hover:text-blue-800 font-medium inline-flex items-center gap-1.5 cursor-pointer"
                >
                  <ArrowLeft className="h-3 w-3" />
                  <span>Voltar para o login</span>
                </button>
              </div>
            </form>
          ) : (
            /* MODO 3: Login Estrito (E-mail, Senha, Continuar, Esqueceu sua senha) - Imagem do Mockup */
            <form onSubmit={handleLoginSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  E-mail
                </label>
                <input
                  type="email"
                  required
                  autoFocus
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="Digite seu e-mail corporativo"
                  className="w-full px-3 py-2.5 text-xs border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Senha
                </label>
                <input
                  type="password"
                  required
                  value={senha}
                  onChange={e => setSenha(e.target.value)}
                  placeholder="Digite sua senha"
                  className="w-full px-3 py-2.5 text-xs border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs flex items-center justify-center gap-2 shadow-sm transition-all cursor-pointer disabled:opacity-50 mt-2"
              >
                {loading ? (
                  <RefreshCw className="h-4 w-4 animate-spin" />
                ) : (
                  <LogIn className="h-4 w-4" />
                )}
                <span>Continuar</span>
              </button>

              <div className="text-center pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setIsForgotMode(true);
                    setForgotEmail(email);
                    setErrorMsg(null);
                    setSuccessMsg(null);
                  }}
                  className="text-xs text-blue-600 hover:text-blue-800 font-medium cursor-pointer transition-colors"
                >
                  Esqueceu sua senha?
                </button>
              </div>
            </form>
          )}

          {errorMsg && (
            <div className="mt-4 p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs flex items-start gap-2">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              <span className="leading-snug">{errorMsg}</span>
            </div>
          )}

          {successMsg && (
            <div className="mt-4 p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
              <span>{successMsg}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

interface EmployeeManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUserEmail?: string | null;
}

export function EmployeeManagerModal({
  isOpen,
  onClose,
  currentUserEmail,
}: EmployeeManagerModalProps) {
  const [users, setUsers] = useState<OfficeUser[]>(getRuntimeOfficeUsers());
  const [nome, setNome] = useState('');
  const [email, setEmail] = useState('');
  const [cargo, setCargo] = useState<'FUNCIONARIO' | 'ADMIN'>('FUNCIONARIO');
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{
    type: 'ok' | 'err';
    text: string;
  } | null>(null);

  // Estados para edição de usuário existente
  const [editingUser, setEditingUser] = useState<OfficeUser | null>(null);
  const [editNome, setEditNome] = useState('');
  const [editCargo, setEditCargo] = useState<'FUNCIONARIO' | 'ADMIN'>('FUNCIONARIO');
  const [editStatus, setEditStatus] = useState<'ATIVO' | 'BLOQUEADO'>('ATIVO');
  const [editSaving, setEditSaving] = useState(false);

  // Estado para confirmação de exclusão
  const [userToDelete, setUserToDelete] = useState<OfficeUser | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    const handler = () => setUsers([...getRuntimeOfficeUsers()]);
    window.addEventListener(OFFICE_USERS_UPDATED_EVENT, handler);
    setUsers([...getRuntimeOfficeUsers()]);
    return () => window.removeEventListener(OFFICE_USERS_UPDATED_EVENT, handler);
  }, [isOpen]);

  if (!isOpen) return null;

  // Criação de Usuário Exclusiva do Gerente Master (Dispara E-mail com Link de Senha)
  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);

    const nomeLimpo = nome.trim();
    const emailLimpo = email.trim().toLowerCase();

    if (!nomeLimpo || !emailLimpo || !emailLimpo.includes('@')) {
      setFeedback({
        type: 'err',
        text: 'Preencha o nome completo e um endereço de e-mail válido.',
      });
      return;
    }

    setSaving(true);
    try {
      const res = await adminCadastrarFuncionarioComLink({
        nome: nomeLimpo,
        email: emailLimpo,
        cargo,
      });

      setNome('');
      setEmail('');
      setCargo('FUNCIONARIO');
      setFeedback({
        type: 'ok',
        text: res.mensagem,
      });
    } catch (err: any) {
      setFeedback({
        type: 'err',
        text: err?.message || 'Erro ao cadastrar funcionário.',
      });
    } finally {
      setSaving(false);
    }
  };

  // Abrir Modal de Edição
  const handleStartEdit = (u: OfficeUser) => {
    setEditingUser(u);
    setEditNome(u.nome);
    setEditCargo(u.cargo);
    setEditStatus(u.status);
    setFeedback(null);
  };

  // Salvar Edição de Usuário
  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser) return;

    setEditSaving(true);
    try {
      await adminEditarFuncionario({
        emailKey: editingUser.emailKey,
        nome: editNome.trim(),
        cargo: editCargo,
        status: editStatus,
      });

      setFeedback({
        type: 'ok',
        text: `Dados de "${editNome.trim()}" atualizados com sucesso!`,
      });
      setEditingUser(null);
    } catch (err: any) {
      setFeedback({
        type: 'err',
        text: err?.message || 'Erro ao salvar alterações do usuário.',
      });
    } finally {
      setEditSaving(false);
    }
  };

  // Reenviar Link de Criação / Redefinição de Senha
  const handleResendPasswordLink = async (u: OfficeUser) => {
    try {
      await adminReenviarLinkSenha(u.email);
      setFeedback({
        type: 'ok',
        text: `Link de criação/redefinição de senha reenviado com sucesso para ${u.email}!`,
      });
    } catch (err: any) {
      setFeedback({
        type: 'err',
        text: err?.message || 'Erro ao reenviar link por e-mail.',
      });
    }
  };

  // Excluir Funcionário
  const handleConfirmDelete = async () => {
    if (!userToDelete) return;
    setDeleting(true);
    try {
      await adminExcluirFuncionario(userToDelete.emailKey);
      setFeedback({
        type: 'ok',
        text: `Usuário "${userToDelete.nome}" foi excluído com sucesso do banco de dados.`,
      });
      setUserToDelete(null);
    } catch (err: any) {
      setFeedback({
        type: 'err',
        text: err?.message || 'Erro ao excluir usuário.',
      });
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-4xl overflow-hidden max-h-[92vh] flex flex-col">
        {/* Cabeçalho */}
        <div className="px-6 py-4 bg-[#04243b] text-white flex items-center justify-between border-b border-slate-700">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-white/10 text-[#e4b35e]">
              <Users className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <span>Gestão de Usuários e Funcionários</span>
                <span className="px-2 py-0.5 rounded-full text-[10px] bg-[#e4b35e] text-[#04243b] font-extrabold uppercase">
                  Gerente Master
                </span>
              </h3>
              <p className="text-[11px] text-slate-300">
                A criação de usuários é restrita ao Gerente. Cada novo usuário recebe um link seguro por e-mail para cadastrar sua senha.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-white/10 cursor-pointer transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto space-y-6 text-xs">
          {/* Feedback Geral */}
          {feedback && (
            <div
              className={`p-3 rounded-xl text-xs font-medium flex items-center justify-between gap-2 ${
                feedback.type === 'ok'
                  ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                  : 'bg-red-50 text-red-700 border border-red-200'
              }`}
            >
              <div className="flex items-center gap-2">
                {feedback.type === 'ok' ? (
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
                ) : (
                  <AlertCircle className="h-4 w-4 shrink-0 text-red-600" />
                )}
                <span>{feedback.text}</span>
              </div>
              <button
                type="button"
                onClick={() => setFeedback(null)}
                className="text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          )}

          {/* Formulário: Cadastrar Novo Funcionário */}
          <form
            onSubmit={handleCreate}
            className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3"
          >
            <div className="flex items-center justify-between">
              <h4 className="font-bold text-[#04243b] text-xs uppercase tracking-wider flex items-center gap-2">
                <UserPlus className="h-4 w-4 text-[#b8862d]" />
                <span>Criar Novo Usuário (Acesso Restrito)</span>
              </h4>
              <span className="text-[10px] text-slate-500 font-medium">
                * Envia link oficial de senha para o e-mail
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
              <div className="sm:col-span-4">
                <label className="block text-[11px] font-bold text-slate-600 mb-1">
                  Nome Completo
                </label>
                <input
                  type="text"
                  required
                  value={nome}
                  onChange={e => setNome(e.target.value)}
                  placeholder="Ex: João da Silva"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white text-xs focus:ring-1 focus:ring-[#04243b]"
                />
              </div>

              <div className="sm:col-span-4">
                <label className="block text-[11px] font-bold text-slate-600 mb-1">
                  E-mail Corporativo
                </label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="funcionario@moreiraelima.com.br"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white text-xs focus:ring-1 focus:ring-[#04243b]"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="block text-[11px] font-bold text-slate-600 mb-1">
                  Perfil de Acesso
                </label>
                <select
                  value={cargo}
                  onChange={e => setCargo(e.target.value as 'FUNCIONARIO' | 'ADMIN')}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white text-xs font-semibold focus:ring-1 focus:ring-[#04243b]"
                >
                  <option value="FUNCIONARIO">Funcionário</option>
                  <option value="ADMIN">Administrador</option>
                </select>
              </div>

              <div className="sm:col-span-2 flex items-end">
                <button
                  type="submit"
                  disabled={saving}
                  className="w-full py-2 px-3 rounded-lg bg-[#04243b] hover:bg-[#063354] text-[#e4b35e] font-bold text-xs flex items-center justify-center gap-1.5 shadow-sm transition-all cursor-pointer disabled:opacity-50"
                >
                  {saving ? (
                    <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Send className="h-3.5 w-3.5" />
                  )}
                  <span>{saving ? 'Criando...' : 'Criar & Enviar'}</span>
                </button>
              </div>
            </div>
          </form>

          {/* Modal / Card de Edição de Usuário Existente */}
          {editingUser && (
            <form
              onSubmit={handleSaveEdit}
              className="p-4 rounded-xl bg-blue-50/70 border border-blue-200 space-y-3 animate-fadeIn"
            >
              <div className="flex items-center justify-between">
                <h4 className="font-bold text-blue-900 text-xs flex items-center gap-1.5">
                  <Edit2 className="h-4 w-4 text-blue-700" />
                  <span>Editar Usuário: {editingUser.email}</span>
                </h4>
                <button
                  type="button"
                  onClick={() => setEditingUser(null)}
                  className="text-xs text-blue-600 hover:underline cursor-pointer"
                >
                  Cancelar
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
                <div className="sm:col-span-4">
                  <label className="block text-[11px] font-bold text-slate-600 mb-1">
                    Nome Completo
                  </label>
                  <input
                    type="text"
                    required
                    value={editNome}
                    onChange={e => setEditNome(e.target.value)}
                    className="w-full px-3 py-2 border border-blue-300 rounded-lg bg-white text-xs"
                  />
                </div>

                <div className="sm:col-span-3">
                  <label className="block text-[11px] font-bold text-slate-600 mb-1">
                    Cargo
                  </label>
                  <select
                    value={editCargo}
                    onChange={e => setEditCargo(e.target.value as 'FUNCIONARIO' | 'ADMIN')}
                    className="w-full px-3 py-2 border border-blue-300 rounded-lg bg-white text-xs font-semibold"
                  >
                    <option value="FUNCIONARIO">Funcionário</option>
                    <option value="ADMIN">Administrador</option>
                  </select>
                </div>

                <div className="sm:col-span-3">
                  <label className="block text-[11px] font-bold text-slate-600 mb-1">
                    Status de Acesso
                  </label>
                  <select
                    value={editStatus}
                    onChange={e => setEditStatus(e.target.value as 'ATIVO' | 'BLOQUEADO')}
                    className="w-full px-3 py-2 border border-blue-300 rounded-lg bg-white text-xs font-semibold"
                  >
                    <option value="ATIVO">ATIVO (Permitido)</option>
                    <option value="BLOQUEADO">BLOQUEADO (Suspenso)</option>
                  </select>
                </div>

                <div className="sm:col-span-2 flex items-end">
                  <button
                    type="submit"
                    disabled={editSaving}
                    className="w-full py-2 px-3 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs flex items-center justify-center gap-1.5 shadow-sm cursor-pointer disabled:opacity-50"
                  >
                    {editSaving ? (
                      <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Check className="h-3.5 w-3.5" />
                    )}
                    <span>Salvar</span>
                  </button>
                </div>
              </div>
            </form>
          )}

          {/* Confirmação de Exclusão */}
          {userToDelete && (
            <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-red-900 space-y-3 animate-fadeIn">
              <div className="flex items-start gap-2.5">
                <Trash2 className="h-5 w-5 text-red-600 shrink-0 mt-0.5" />
                <div>
                  <h4 className="font-bold text-xs text-red-800">
                    Confirmar Exclusão de Usuário
                  </h4>
                  <p className="text-[11px] text-red-700 mt-0.5">
                    Tem certeza que deseja excluir o acesso de <strong>{userToDelete.nome}</strong> ({userToDelete.email})? Ele perderá imediatamente a permissão de entrar no sistema e consultar os dados fiscais.
                  </p>
                </div>
              </div>
              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setUserToDelete(null)}
                  disabled={deleting}
                  className="px-3 py-1.5 rounded-lg border border-slate-300 text-slate-700 bg-white hover:bg-slate-50 font-semibold cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleConfirmDelete}
                  disabled={deleting}
                  className="px-3.5 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white font-bold cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
                >
                  {deleting ? (
                    <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Trash2 className="h-3.5 w-3.5" />
                  )}
                  <span>Confirmar Exclusão</span>
                </button>
              </div>
            </div>
          )}

          {/* Lista de Usuários do Escritório */}
          <div className="border border-slate-200 rounded-xl overflow-hidden shadow-xs">
            <div className="px-4 py-2.5 bg-slate-100 border-b border-slate-200 flex items-center justify-between">
              <span className="font-bold text-slate-700 text-xs uppercase tracking-wide">
                Usuários Autorizados no Sistema ({users.length})
              </span>
              <span className="text-[11px] text-slate-500">
                Sincronizado em tempo real com o banco de dados
              </span>
            </div>

            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 text-slate-600 text-[11px] font-bold uppercase border-b border-slate-200">
                  <th className="py-2.5 px-3">Nome</th>
                  <th className="py-2.5 px-3">E-mail</th>
                  <th className="py-2.5 px-3">Cargo</th>
                  <th className="py-2.5 px-3">Status</th>
                  <th className="py-2.5 px-3 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 text-xs">
                {users.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-slate-400">
                      Nenhum usuário cadastrado ainda. Use o formulário acima para adicionar o primeiro funcionário.
                    </td>
                  </tr>
                ) : (
                  users.map(u => {
                    const isMasterUser = isMasterAdminEmail(u.email);
                    return (
                      <tr key={u.emailKey} className="hover:bg-slate-50 transition-colors">
                        <td className="py-2.5 px-3 font-bold text-slate-800">
                          <div className="flex items-center gap-2">
                            <span>{u.nome}</span>
                            {isMasterUser && (
                              <span className="px-1.5 py-0.5 rounded text-[9px] bg-[#04243b] text-[#e4b35e] font-bold">
                                MASTER
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="py-2.5 px-3 text-slate-600 font-mono text-[11px]">
                          {u.email}
                        </td>
                        <td className="py-2.5 px-3">
                          <span
                            className={`px-2 py-0.5 rounded font-bold text-[10px] ${
                              u.cargo === 'ADMIN'
                                ? 'bg-amber-100 text-amber-900 border border-amber-200'
                                : 'bg-slate-100 text-slate-700 border border-slate-200'
                            }`}
                          >
                            {u.cargo}
                          </span>
                        </td>
                        <td className="py-2.5 px-3">
                          <span
                            className={`px-2 py-0.5 rounded font-bold text-[10px] ${
                              u.status === 'ATIVO'
                                ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                                : 'bg-red-100 text-red-700 border border-red-200'
                            }`}
                          >
                            {u.status}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-right">
                          {isMasterUser ? (
                            <span className="text-[10px] text-slate-400 font-semibold italic">
                              Gerente Master Protegido
                            </span>
                          ) : (
                            <div className="inline-flex items-center gap-1.5">
                              {/* Reenviar Link de Senha */}
                              <button
                                type="button"
                                onClick={() => handleResendPasswordLink(u)}
                                className="p-1.5 rounded-lg border border-slate-300 text-slate-600 hover:bg-slate-100 cursor-pointer"
                                title="Reenviar link de criação/redefinição de senha para o e-mail"
                              >
                                <Send className="h-3.5 w-3.5" />
                              </button>

                              {/* Editar Usuário */}
                              <button
                                type="button"
                                onClick={() => handleStartEdit(u)}
                                className="p-1.5 rounded-lg border border-blue-200 text-blue-600 hover:bg-blue-50 cursor-pointer"
                                title="Editar dados e permissões do usuário"
                              >
                                <Edit2 className="h-3.5 w-3.5" />
                              </button>

                              {/* Excluir Usuário */}
                              <button
                                type="button"
                                onClick={() => setUserToDelete(u)}
                                className="p-1.5 rounded-lg border border-red-200 text-red-600 hover:bg-red-50 cursor-pointer"
                                title="Excluir funcionário permanentemente"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

export function clearUnlockedSession(): void {
  if (typeof window !== 'undefined') {
    sessionStorage.removeItem(SESSION_UNLOCKED_KEY);
  }
}
