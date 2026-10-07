// Roda com: bun test
import { expect, test } from "bun:test";

import {
  ATALHOS,
  diasAtras,
  fimDoDia,
  formatarDuracao,
  inicioDoDia,
  mediana,
  paraInput,
} from "./periodo";

test("paraInput usa a data local, não a UTC", () => {
  // 21h em UTC-4 já é o dia seguinte em UTC; o filtro tem que mostrar o dia local
  const noite = new Date(2026, 8, 21, 21, 30);
  expect(paraInput(noite)).toBe("2026-09-21");
  expect(paraInput(new Date(2026, 0, 5))).toBe("2026-01-05");
  expect(paraInput(new Date(2026, 11, 31, 23, 59))).toBe("2026-12-31");
});

test("os limites do dia cobrem a jornada inteira", () => {
  const i = inicioDoDia("2026-09-21");
  const f = fimDoDia("2026-09-21");
  expect([i.getHours(), i.getMinutes(), i.getSeconds()]).toEqual([0, 0, 0]);
  expect([f.getHours(), f.getMinutes(), f.getSeconds()]).toEqual([23, 59, 59]);
  expect(i.getDate()).toBe(21);
  expect(f.getDate()).toBe(21);
  expect(f.getTime() - i.getTime()).toBe(86_400_000 - 1);
});

test("um pedido das 23h de hoje cai dentro de 'Hoje'", () => {
  const hoje = new Date();
  const iso = paraInput(hoje);
  const tarde = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate(), 23, 0, 0);
  expect(tarde >= inicioDoDia(iso)).toBe(true);
  expect(tarde <= fimDoDia(iso)).toBe(true);
});

test("diasAtras conta para trás e atravessa a virada de mês", () => {
  expect(diasAtras(0, new Date(2026, 8, 21))).toBe("2026-09-21");
  expect(diasAtras(6, new Date(2026, 8, 21))).toBe("2026-09-15");
  expect(diasAtras(1, new Date(2026, 8, 1))).toBe("2026-08-31");
  expect(diasAtras(1, new Date(2026, 0, 1))).toBe("2025-12-31");
});

test("'7 dias' são 7 dias contando hoje, não 8", () => {
  const hoje = new Date();
  const de = inicioDoDia(ATALHOS.find((a) => a.id === "7dias")!.de());
  const ate = fimDoDia(paraInput(hoje));
  const dias = Math.round((ate.getTime() - de.getTime()) / 86_400_000);
  expect(dias).toBe(7);
});

test("'30 dias' são 30 dias contando hoje", () => {
  const de = inicioDoDia(ATALHOS.find((a) => a.id === "30dias")!.de());
  const ate = fimDoDia(paraInput(new Date()));
  expect(Math.round((ate.getTime() - de.getTime()) / 86_400_000)).toBe(30);
});

test("formatarDuracao: minutos, horas e dias, sem zero sobrando", () => {
  expect(formatarDuracao(0.4)).toBe("menos de 1 min");
  expect(formatarDuracao(45)).toBe("45 min");
  expect(formatarDuracao(60)).toBe("1h");
  expect(formatarDuracao(135)).toBe("2h 15min");
  expect(formatarDuracao(24 * 60)).toBe("1d");
  expect(formatarDuracao(3 * 24 * 60 + 4 * 60 + 20)).toBe("3d 4h");
});

test("mediana: o do meio, a média dos dois do meio, null sem nada", () => {
  expect(mediana([])).toBeNull();
  expect(mediana([30, 5, 10_000])).toBe(30);
  expect(mediana([40, 10, 20, 30])).toBe(25);
});
