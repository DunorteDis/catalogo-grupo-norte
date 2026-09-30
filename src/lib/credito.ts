/** R$ 1.234,56 */
export function formatarReais(valor: number) {
  return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

/** 02/01/2026; vazio sem data. */
export function formatarDia(iso: string | null) {
  return iso ? new Date(iso).toLocaleDateString("pt-BR") : "";
}

/** "1 título", "3 títulos". */
export const plural = (n: number, palavra: string) => `${n} ${palavra}${n === 1 ? "" : "s"}`;

/** Dias inteiros desde a data até hoje. */
export function diasDesde(iso: string, hoje = Date.now()) {
  return Math.floor((hoje - Date.parse(iso)) / 864e5);
}

/** Vencido, vence nos próximos 7 dias ou em dia — pela quantidade de dias de atraso. */
export function situacaoTitulo(diasAtraso: number) {
  if (diasAtraso > 0)
    return { tom: "vencido" as const, texto: `Vencido há ${plural(diasAtraso, "dia")}` };
  if (diasAtraso === 0) return { tom: "vence" as const, texto: "Vence hoje" };
  const faltam = -diasAtraso;
  return {
    tom: faltam <= 7 ? ("vence" as const) : ("em-dia" as const),
    texto: `Vence em ${plural(faltam, "dia")}`,
  };
}

/**
 * O que o vendedor precisa saber antes de vender a prazo. `livre` é o limite menos
 * os títulos em aberto; pedido ainda não faturado não entra, então é uma estimativa.
 */
export function resumoCredito(limite: number, titulos: { saldo: number; diasAtraso: number }[]) {
  const vencidos = titulos.filter((t) => t.diasAtraso > 0);
  const emAberto = titulos.reduce((s, t) => s + t.saldo, 0);
  return {
    emAberto,
    vencido: vencidos.reduce((s, t) => s + t.saldo, 0),
    qtdVencidos: vencidos.length,
    maiorAtraso: Math.max(0, ...vencidos.map((t) => t.diasAtraso)),
    livre: limite - emAberto,
    /** Fração do limite já comprometida (1 = no limite); 0 sem limite. */
    uso: limite > 0 ? emAberto / limite : 0,
  };
}
