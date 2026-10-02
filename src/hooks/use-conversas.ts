import { createContext, useContext } from "react";

/**
 * Se quem está logado vê o módulo de Conversas (veConversas, em src/server/whatsapp.ts).
 * O layout da área logada calcula uma vez e o AppShell repassa para as telas.
 */
export const ConversasContexto = createContext(false);

export function useConversas() {
  return useContext(ConversasContexto);
}
