/** O que toda Server Action devolve: em produção o Next esconde a mensagem de erro lançado. */
export type Resultado<T> = { dados: T } | { erro: string };

/**
 * Contraparte de `Recusa` no client: `acao()` já entrega texto final para a tela
 * (Recusa como está, qualquer outro erro já passado por `mensagemErro` no servidor).
 * `instanceof ErroAcao` avisa a tela que não precisa (e não deve) traduzir de novo —
 * "Muitas tentativas erradas...", por exemplo, não tem acento e cairia no genérico.
 */
export class ErroAcao extends Error {}

/** Desembrulha no client: `erro` vira ErroAcao, e a tela mostra `.message` direto. */
export async function chamar<T>(pendente: Promise<Resultado<T>>): Promise<T> {
  const r = await pendente;
  if ("erro" in r) throw new ErroAcao(r.erro);
  return r.dados;
}
