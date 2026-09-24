import { ZodError } from "zod";

import type { Resultado } from "@/lib/chamar";
import { mensagemErro } from "@/lib/erros";

/** Erro esperado (validação, permissão): a mensagem vai para a tela como está. */
export class Recusa extends Error {}

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
      return { erro: mensagemErro(e) };
    }
  };
}
