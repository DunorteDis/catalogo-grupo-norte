const MAPA: { teste: RegExp; texto: string }[] = [
  {
    teste: /password is known to be weak|pwned|weak and easy to guess/i,
    texto:
      "Essa senha é muito comum e aparece em vazamentos. Escolha uma senha mais forte (8+ caracteres, com letras, números e símbolos).",
  },
  {
    teste: /password should be at least|password.*too short/i,
    texto: "A senha é muito curta. Use pelo menos 6 caracteres.",
  },
  {
    teste: /invalid login credentials/i,
    texto: "E-mail ou senha incorretos.",
  },
  {
    teste: /email not confirmed/i,
    texto: "Confirme seu e-mail antes de entrar. Verifique sua caixa de entrada.",
  },
  {
    teste: /user already registered|already been registered/i,
    texto: "Já existe uma conta com esse e-mail. Faça login.",
  },
  {
    teste: /unable to validate email|invalid email/i,
    texto: "E-mail inválido. Confira o endereço digitado.",
  },
  {
    teste: /email rate limit|over_email_send_rate_limit|too many requests|rate limit/i,
    texto: "Muitas tentativas em pouco tempo. Aguarde alguns minutos e tente novamente.",
  },
  {
    teste: /signups not allowed|signup is disabled/i,
    texto: "Novos cadastros estão desativados no momento.",
  },
  {
    teste: /duplicate key|already exists|unique constraint/i,
    texto: "Esse registro já existe. Verifique os dados informados.",
  },
  {
    teste: /row-level security|permission denied|not authorized|jwt|401|403/i,
    texto: "Você não tem permissão para fazer isso. Entre novamente e tente de novo.",
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
