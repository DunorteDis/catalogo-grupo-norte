/** O que toda Server Action devolve: em produção o Next esconde a mensagem de erro lançado. */
export type Resultado<T> = { dados: T } | { erro: string };

/** Desembrulha no client: `erro` vira Error, e o `toast.error(mensagemErro(e))` das telas segue igual. */
export async function chamar<T>(pendente: Promise<Resultado<T>>): Promise<T> {
  const r = await pendente;
  if ("erro" in r) throw new Error(r.erro);
  return r.dados;
}
