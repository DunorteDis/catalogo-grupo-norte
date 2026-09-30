import { ErroAcao } from "@/lib/chamar";

const MAPA: { teste: RegExp; texto: string }[] = [
  {
    teste: /email rate limit|over_email_send_rate_limit|too many requests|rate limit/i,
    texto: "Muitas tentativas em pouco tempo. Aguarde alguns minutos e tente novamente.",
  },
  {
    teste: /duplicate key|already exists|unique constraint/i,
    texto: "Esse registro já existe. Verifique os dados informados.",
  },
  {
    teste: /violates foreign key/i,
    texto: "Esse registro está ligado a outros dados e não pode ser removido.",
  },
  {
    teste: /null value in column|not-null constraint|required/i,
    texto: "Preencha todos os campos obrigatórios.",
  },
  {
    teste: /failed to fetch|network|timeout|fetch error/i,
    texto: "Falha de conexão. Verifique sua internet e tente novamente.",
  },
];

export function mensagemErro(erro: unknown, padrao = "Algo deu errado. Tente novamente."): string {
  // acao() já entrega texto final para a tela (Recusa como está, ou já traduzido
  // no servidor pelo próprio mensagemErro); tentar de novo aqui só erra em
  // mensagens sem acento, como a do freio de login ("Muitas tentativas...").
  if (erro instanceof ErroAcao) return erro.message;

  const bruto =
    erro instanceof Error
      ? erro.message
      : typeof erro === "string"
        ? erro
        : typeof erro === "object" && erro && "message" in erro
          ? String((erro as { message: unknown }).message)
          : "";

  if (!bruto) return padrao;
  const achado = MAPA.find((m) => m.teste.test(bruto));
  if (achado) return achado.texto;
  // Se a mensagem já estiver em português, mostra como veio.
  if (/[áàâãéêíóôõúç]/i.test(bruto)) return bruto;
  return padrao;
}
