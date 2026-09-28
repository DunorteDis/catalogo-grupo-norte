// Roda com: bun test
import { expect, test } from "bun:test";

import { CORTE, planejar, type Destino, type Fonte } from "./sincronizar-supabase";

const antes = new Date(+CORTE - 86_400_000);
const depois = new Date(+CORTE + 86_400_000);
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

test("mais recente vence: só atualiza o que foi editado depois no Supabase", () => {
  const f: Fonte = {
    ...vazio,
    produtos: [
      { id: "editado-no-supabase", updated_at: depois },
      { id: "curado-no-crm", updated_at: antes }, // crm desativou depois: fica como está
      { id: "novo", updated_at: antes },
    ],
  };
  const d: Destino = {
    ...vazio,
    produtos: [
      { id: "editado-no-supabase", updated_at: antes, created_at: antes },
      { id: "curado-no-crm", updated_at: depois, created_at: antes },
    ],
  };
  const p = planejar(f, d);
  expect(p.produtosAtualizar.map((r) => r.id)).toEqual(["editado-no-supabase"]);
  expect(p.produtosNovos.map((r) => r.id)).toEqual(["novo"]);
});

test("só apaga produto da cópia inicial que sumiu do Supabase; o criado no sistema novo fica", () => {
  const d: Destino = {
    ...vazio,
    produtos: [
      { id: "apagado-no-antigo", updated_at: antes, created_at: antes },
      { id: "criado-no-novo", updated_at: depois, created_at: depois },
    ],
  };
  expect(planejar(vazio, d).produtosApagar.map((r) => r.id)).toEqual(["apagado-no-antigo"]);
});

test("catálogo novo entra inteiro; vínculo e seção de catálogo existente não", () => {
  const f: Fonte = {
    ...vazio,
    catalogos: [{ id: "novo" }, { id: "existente" }],
    secoes: [
      { id: "s1", distribuidora_id: "novo" },
      { id: "s2", distribuidora_id: "existente" },
    ],
    vinculos: [
      { id: "v1", distribuidora_id: "novo" },
      { id: "v2", distribuidora_id: "existente" },
    ],
  };
  const p = planejar(f, { ...vazio, catalogos: [{ id: "existente" }] });
  expect(p.catalogosNovos.map((r) => r.id)).toEqual(["novo"]);
  expect(p.secoesNovas.map((r) => r.id)).toEqual(["s1"]);
  expect(p.vinculosNovos.map((r) => r.id)).toEqual(["v1"]);
});

test("pedido e usuário do sistema novo nunca saem; os do Supabase entram", () => {
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
  expect(p).not.toHaveProperty("pedidosApagar");
});
