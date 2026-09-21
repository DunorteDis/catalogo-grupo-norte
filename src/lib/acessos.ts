/**
 * O Supabase só autentica por e-mail, mas o acesso aqui é por usuário
 * (primeiro.ultimo). Cada conta guarda um e-mail sintético neste domínio; a tela
 * de login completa sozinha. O e-mail de verdade, quando informado, é só contato.
 */
export const DOMINIO_ACESSO = "acesso.gruponorte.com.br";

export function emailDeUsuario(usuario: string) {
  return `${usuario.trim().toLowerCase()}@${DOMINIO_ACESSO}`;
}

export function usuarioDeEmail(email: string) {
  return email.endsWith(`@${DOMINIO_ACESSO}`)
    ? email.slice(0, -`@${DOMINIO_ACESSO}`.length)
    : email;
}

/**
 * O que a pessoa digita no login. Contas antigas foram criadas com e-mail real,
 * então quem digita algo com "@" entra com aquilo mesmo.
 */
export function loginParaEmail(entrada: string) {
  const v = entrada.trim().toLowerCase();
  return v.includes("@") ? v : emailDeUsuario(v);
}

export function usuarioDeNome(nome: string) {
  const limpo = (nome || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (limpo.length === 0) return "usuario";
  // primeiro.ultimo — nomes do meio ficam de fora para o login ser curto de ditar
  return limpo.length === 1 ? limpo[0]! : `${limpo[0]}.${limpo[limpo.length - 1]}`;
}

export const USUARIO_MIN = 3;
export const USUARIO_MAX = 40;
/** Minúsculas, números e pontos separando blocos. Sem acento, espaço ou ponto solto. */
export const USUARIO_REGEX = /^[a-z0-9]+(\.[a-z0-9]+)*$/;

/** Limpa o que a pessoa digitou no campo, sem brigar com ela enquanto digita. */
export function normalizarUsuario(valor: string) {
  return (valor || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[\s_]+/g, ".")
    .replace(/[^a-z0-9.]/g, "")
    .replace(/\.{2,}/g, ".")
    .slice(0, USUARIO_MAX);
}

/** Mensagem de erro, ou null se estiver válido. */
export function validarUsuario(usuario: string) {
  if (usuario.length < USUARIO_MIN)
    return `O usuário precisa de ao menos ${USUARIO_MIN} caracteres.`;
  if (usuario.length > USUARIO_MAX) return `O usuário passa de ${USUARIO_MAX} caracteres.`;
  if (!USUARIO_REGEX.test(usuario))
    return "Use apenas letras, números e ponto — por exemplo, primeiro.ultimo.";
  return null;
}

// Sem 0/O e 1/l/I: a senha é ditada ou colada no WhatsApp, ambiguidade vira chamado.
const LETRAS = "abcdefghjkmnpqrstuvwxyz";
const DIGITOS = "23456789";
export const ALFABETO_SENHA = LETRAS + DIGITOS;
/** Piso do Supabase é 6; abaixo disso ele recusa a senha como fraca. */
export const TAMANHO_SENHA = 6;

export function sortear(alfabeto: string, quantidade: number) {
  const bytes = new Uint32Array(quantidade);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => alfabeto[b % alfabeto.length]!);
}

export function gerarSenha() {
  // Garante uma letra e um dígito, caso o projeto exija `letters_digits`.
  const chars = [...sortear(LETRAS, 1), ...sortear(DIGITOS, 1)];
  chars.push(...sortear(ALFABETO_SENHA, TAMANHO_SENHA - chars.length));
  const ordem = sortear("0123456789", chars.length);
  return chars
    .map((c, i) => ({ c, k: ordem[i]! }))
    .sort((a, b) => a.k.localeCompare(b.k))
    .map((x) => x.c)
    .join("");
}

/** Texto pronto para colar na conversa do WhatsApp. */
export function mensagemAcesso(opts: {
  nome: string;
  usuario: string;
  senha: string;
  url: string;
}) {
  return [
    `Acesso ao catálogo Grupo Norte`,
    ``,
    `Usuário: ${opts.usuario}`,
    `Senha: ${opts.senha}`,
    ``,
    `Entre em:`,
    opts.url,
  ].join("\n");
}

/**
 * Marca no user_metadata que a senha atual foi gerada pelo sistema e trafegou por
 * WhatsApp. Enquanto estiver ligada, o app exige a troca antes de liberar as telas.
 */
export const CHAVE_SENHA_PROVISORIA = "senha_provisoria";

export function senhaEhProvisoria(metadata: unknown) {
  return (metadata as Record<string, unknown> | null)?.[CHAVE_SENHA_PROVISORIA] === true;
}
