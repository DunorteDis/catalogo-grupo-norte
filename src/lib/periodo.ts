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

/** "45 min", "2h 15min", "3d 4h": tempo de atendimento no painel. */
export function formatarDuracao(minutos: number) {
  const m = Math.round(minutos);
  if (m < 1) return "menos de 1 min";
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return m % 60 ? `${h}h ${m % 60}min` : `${h}h`;
  const d = Math.floor(h / 24);
  return h % 24 ? `${d}d ${h % 24}h` : `${d}d`;
}

/** Mediana: um pedido esquecido no fim de semana não puxa o número como puxaria a média. */
export function mediana(valores: number[]) {
  if (!valores.length) return null;
  const v = [...valores].sort((a, b) => a - b);
  const meio = Math.floor(v.length / 2);
  return v.length % 2 ? v[meio]! : (v[meio - 1]! + v[meio]!) / 2;
}

export function formatarData(iso: string) {
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}
