/**
 * Datas do filtro de período, sempre no fuso local.
 *
 * O `toISOString()` converte para UTC, e aqui é UTC−4: um pedido das 21h de hoje
 * cairia no dia seguinte em UTC, e "Hoje" mostraria o dia errado à noite. Por isso
 * o yyyy-mm-dd é montado com getFullYear/getMonth/getDate, e os limites do dia são
 * construídos em horário local antes de virarem ISO para o banco.
 */
export function paraInput(d: Date) {
  const mes = String(d.getMonth() + 1).padStart(2, "0");
  const dia = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mes}-${dia}`;
}

export function inicioDoDia(iso: string) {
  const [a, m, d] = iso.split("-").map(Number);
  return new Date(a!, m! - 1, d!, 0, 0, 0, 0);
}

export function fimDoDia(iso: string) {
  const [a, m, d] = iso.split("-").map(Number);
  return new Date(a!, m! - 1, d!, 23, 59, 59, 999);
}

export function diasAtras(n: number, hoje = new Date()) {
  const d = new Date(hoje);
  d.setDate(d.getDate() - n);
  return paraInput(d);
}

/** "7 dias" inclui hoje, então volta 6 — senão seriam 8 dias na conta. */
export const ATALHOS = [
  { id: "hoje", label: "Hoje", de: () => paraInput(new Date()) },
  { id: "7dias", label: "7 dias", de: () => diasAtras(6) },
  { id: "30dias", label: "30 dias", de: () => diasAtras(29) },
] as const;

export type Atalho = (typeof ATALHOS)[number]["id"] | "personalizado";

export function formatarData(iso: string) {
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}
