import { ZodError } from "zod";

import type { Resultado } from "@/lib/chamar";

/** Erro esperado (validação, permissão): a mensagem vai para a tela como está. */
export class Recusa extends Error {}

/**
 * Erro de banco que não é Recusa nem ZodError: mapeia pelo SQLSTATE, não pela
 * mensagem crua. Se o Postgres responder em português (lc_messages), a mensagem
 * crua não bate com um regex em inglês e vazaria nome de tabela/coluna/valor na
 * tela — o código de erro não muda com o idioma. Textos iguais aos de
 * src/lib/erros.ts (MAPA), que segue mapeando erro cru do lado do client.
 */
function mensagemPorSqlstate(code: string | undefined): string {
  switch (code) {
    case "23505":
      return "Esse registro já existe. Verifique os dados informados.";
    case "23503":
      return "Esse registro está ligado a outros dados e não pode ser removido.";
    default:
      return "Algo deu errado. Tente novamente.";
  }
}

/**
 * Embrulha uma Server Action. Erro lançado dentro dela chegaria ao client como
 * texto genérico em produção, então volta como valor. Erro que não é Recusa é
 * bug ou banco fora do ar: vai para o log do servidor.
 */
export function acao<A extends unknown[], T>(fn: (...args: A) => Promise<T>) {
  return async (...args: A): Promise<Resultado<T>> => {
    try {
      return { dados: await fn(...args) };
    } catch (e) {
      if (e instanceof Recusa) return { erro: e.message };
      if (e instanceof ZodError) return { erro: e.issues[0]?.message ?? "Dados inválidos." };
      console.error(e);
      return { erro: mensagemPorSqlstate((e as { code?: string }).code) };
    }
  };
}
