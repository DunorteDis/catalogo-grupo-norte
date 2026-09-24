// Freio contra força bruta no login: o Supabase fazia isso por nós.
// ponytail: contador em memória — vale para UMA instância do Next. Com mais de
// uma atrás de balanceador, mover para uma tabela no crm.
const MAX_ERROS = 5;
const JANELA_MS = 15 * 60 * 1000;

const registros = new Map<string, { erros: number; desde: number }>();

export function loginBloqueado(chave: string, agora = Date.now()) {
  const r = registros.get(chave);
  if (!r) return false;
  if (agora - r.desde > JANELA_MS) {
    registros.delete(chave);
    return false;
  }
  return r.erros >= MAX_ERROS;
}

export function registrarErroLogin(chave: string, agora = Date.now()) {
  const r = registros.get(chave);
  if (!r || agora - r.desde > JANELA_MS) registros.set(chave, { erros: 1, desde: agora });
  else r.erros++;
  // Rajada de chaves diferentes não pode crescer o mapa para sempre.
  if (registros.size > 10_000)
    for (const [k, v] of registros) if (agora - v.desde > JANELA_MS) registros.delete(k);
}

export function limparErrosLogin(chave: string) {
  registros.delete(chave);
}
