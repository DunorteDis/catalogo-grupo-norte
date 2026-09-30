import { toast } from "sonner";

/**
 * No lugar do window.confirm: um toast com a ação e Cancelar, que espera a
 * escolha. Fechar sem escolher conta como Cancelar. Toda confirmação daqui é
 * de algo que não se desfaz, então o botão da ação sai em vermelho.
 */
export function confirmar(pergunta: string, acao: string) {
  return new Promise<boolean>((responder) => {
    // ponytail: o id evita empilhar a mesma pergunta em dois cliques; a promessa
    // do toast substituído só fica sem resposta, e nada espera por ela.
    toast(pergunta, {
      id: pergunta,
      duration: Infinity,
      action: { label: acao, onClick: () => responder(true) },
      cancel: { label: "Cancelar", onClick: () => responder(false) },
      onDismiss: () => responder(false),
      classNames: { actionButton: "!bg-danger !text-destructive-foreground" },
    });
  });
}
