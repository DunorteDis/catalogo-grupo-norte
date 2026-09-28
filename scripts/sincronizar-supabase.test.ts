// Roda com: bun test
import { expect, test } from "bun:test";

import { planejar, type Destino, type Fonte } from "./sincronizar-supabase";

const antes = new Date("2026-09-20T00:00:00Z");
const depois = new Date("2026-09-25T00:00:00Z");
const vazio = {
  usuarios: [],
  papeis: [],
  catalogos: [],
  secoes: [],
  vendedores: [],
  produtos: [],
  vinculos: [],
  pedidos: [],
  itens: [],
};

test("mais recente vence: só atualiza usuário editado depois no Supabase", () => {
  const f: Fonte = {
    ...vazio,
    usuarios: [
      { id: "editado-no-supabase", updated_at: depois },
      { id: "editado-no-crm", updated_at: antes }, // ex.: trocou a senha no sistema novo
      { id: "novo", updated_at: antes },
    ],
  };
  const d: Destino = {
    ...vazio,
    usuarios: [
      { id: "editado-no-supabase", updated_at: antes },
      { id: "editado-no-crm", updated_at: depois },
    ],
  };
  const p = planejar(f, d);
  expect(p.usuariosAtualizar.map((r) => r.id)).toEqual(["editado-no-supabase"]);
  expect(p.usuariosNovos.map((r) => r.id)).toEqual(["novo"]);
});

test("catálogo novo entra inteiro, mas só com produto que existe no crm (produto é do ERP)", () => {
  const f: Fonte = {
    ...vazio,
    catalogos: [{ id: "novo" }, { id: "existente" }],
    secoes: [
      { id: "s1", distribuidora_id: "novo" },
      { id: "s2", distribuidora_id: "existente" },
    ],
    vinculos: [
      { id: "v1", distribuidora_id: "novo", produto_id: "no-crm" },
      { id: "v2", distribuidora_id: "novo", produto_id: "so-no-supabase" },
      { id: "v3", distribuidora_id: "existente", produto_id: "no-crm" },
    ],
  };
  const p = planejar(f, {
    ...vazio,
    catalogos: [{ id: "existente" }],
    produtos: [{ id: "no-crm" }],
  });
  expect(p.catalogosNovos.map((r) => r.id)).toEqual(["novo"]);
  expect(p.secoesNovas.map((r) => r.id)).toEqual(["s1"]);
  expect(p.vinculosNovos.map((r) => r.id)).toEqual(["v1"]);
  expect(p.vinculosSemProduto.map((r) => r.id)).toEqual(["v2"]);
});

test("pedido e usuário do sistema novo nunca saem; e produto não é tocado", () => {
  const f: Fonte = {
    ...vazio,
    pedidos: [{ id: "antigo" }],
    usuarios: [{ id: "u2", updated_at: antes }],
  };
  const d: Destino = {
    ...vazio,
    pedidos: [{ id: "do-sistema-novo" }],
    usuarios: [{ id: "u1", updated_at: antes }],
  };
  const p = planejar(f, d);
  expect(p.pedidosNovos.map((r) => r.id)).toEqual(["antigo"]);
  expect(p.usuariosNovos.map((r) => r.id)).toEqual(["u2"]);
  expect(Object.keys(p).some((k) => k.startsWith("produtos"))).toBe(false);
});
