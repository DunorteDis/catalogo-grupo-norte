// Traz para o crm o que mudou no Supabase (sistema antigo, ainda no ar) desde a
// cópia inicial: pedidos, usuários, produtos e catálogos que só existem lá.
//
// Roda com: bun scripts/sincronizar-supabase.ts            (só simula e mostra o plano)
//           bun scripts/sincronizar-supabase.ts --gravar   (grava, numa transação só)
// Precisa de SUPABASE_DB_URL e PG* no .env. Pode rodar de novo antes da virada:
// só insere o que falta e só atualiza o que foi editado depois no Supabase.
//
// Regras:
// - Registro novo no Supabase (id que o crm não tem) entra.
// - Registro nos dois: vale o mais recente pelo updated_at (usuários e produtos).
//   No crm, 3.205 produtos foram desativados de propósito em 23/09; copiar por
//   cima os reativaria — por isso nada de "Supabase vence sempre".
// - Catálogo que só existe no Supabase entra inteiro: seções e produtos vinculados.
// - Produto que sumiu do Supabase e já estava no crm antes do sistema novo
//   (created_at < CORTE) foi apagado no sistema antigo: sai do crm também. Produto
//   criado no sistema novo é depois do CORTE e nunca é apagado.
// - Pedido, usuário e vendedor nunca são apagados.
import { writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import postgres from "postgres";

/** Início do sistema novo: nada criado no crm a partir daqui veio da cópia. */
export const CORTE = new Date("2026-09-24T00:00:00-04:00");

type ComId = { id: string };
type ComData = ComId & { updated_at: Date };

export type Fonte = {
  usuarios: ComData[];
  papeis: ComId[];
  catalogos: ComId[];
  secoes: (ComId & { distribuidora_id: string })[];
  vendedores: ComId[];
  produtos: ComData[];
  vinculos: (ComId & { distribuidora_id: string })[];
  pedidos: ComId[];
  itens: ComId[];
};
export type Destino = {
  usuarios: ComData[];
  papeis: ComId[];
  catalogos: ComId[];
  secoes: ComId[];
  vendedores: ComId[];
  produtos: (ComData & { created_at: Date })[];
  pedidos: ComId[];
  itens: ComId[];
};

/** O que fazer, só com ids — sem tocar em banco, para dar para testar. */
export function planejar(f: Fonte, d: Destino) {
  const tem = (rs: ComId[]) => new Set(rs.map((r) => r.id));
  const novos = <T extends ComId>(rs: T[], ja: ComId[]) => {
    const s = tem(ja);
    return rs.filter((r) => !s.has(r.id));
  };
  const maisNovos = <T extends ComData>(rs: T[], ja: ComData[]) => {
    const quando = new Map(ja.map((r) => [r.id, +r.updated_at]));
    return rs.filter((r) => quando.has(r.id) && +r.updated_at > quando.get(r.id)!);
  };
  const catalogosNovos = novos(f.catalogos, d.catalogos);
  const idsCatalogosNovos = tem(catalogosNovos);
  const noSupabase = tem(f.produtos);
  return {
    usuariosNovos: novos(f.usuarios, d.usuarios),
    usuariosAtualizar: maisNovos(f.usuarios, d.usuarios),
    papeisNovos: novos(f.papeis, d.papeis),
    catalogosNovos,
    secoesNovas: novos(f.secoes, d.secoes).filter((s) => idsCatalogosNovos.has(s.distribuidora_id)),
    vendedoresNovos: novos(f.vendedores, d.vendedores),
    produtosNovos: novos(f.produtos, d.produtos),
    produtosAtualizar: maisNovos(f.produtos, d.produtos),
    vinculosNovos: f.vinculos.filter((v) => idsCatalogosNovos.has(v.distribuidora_id)),
    pedidosNovos: novos(f.pedidos, d.pedidos),
    itensNovos: novos(f.itens, d.itens),
    produtosApagar: d.produtos.filter((p) => !noSupabase.has(p.id) && +p.created_at < +CORTE),
  };
}

async function principal() {
  const gravar = process.argv.includes("--gravar");
  const url = process.env["SUPABASE_DB_URL"];
  if (!url) throw new Error("Defina SUPABASE_DB_URL (Supabase → Project Settings → Database).");

  // prepare: false — o pooler do Supabase em modo transação não aceita prepared statement.
  const supa = postgres(url, { ssl: "require", max: 1, prepare: false });
  const crm = postgres({ connection: { search_path: "crm" }, max: 1 });
  try {
    const f = {
      usuarios: await supa`
        select id::text, email, phone, raw_user_meta_data, email_confirmed_at, last_sign_in_at,
               created_at, updated_at, encrypted_password
          from auth.users`,
      papeis: await supa`select id::text, user_id::text, role, created_at from public.user_roles`,
      catalogos: await supa`select * from public.distribuidoras`,
      secoes: await supa`select * from public.catalogo_secoes`,
      vendedores: await supa`select * from public.vendedores`,
      produtos: await supa`
        select id::text, codigo, nome, arquivo, ativo, created_at, updated_at, cod_empresa
          from public.produtos`,
      vinculos: await supa`select * from public.distribuidora_produtos`,
      pedidos: await supa`select * from public.pedidos`,
      itens: await supa`select * from public.pedido_itens`,
    } as unknown as Fonte & Record<string, Record<string, unknown>[]>;
    const d = {
      usuarios: await crm`select id::text, updated_at from usuarios`,
      papeis: await crm`select id::text from user_roles`,
      catalogos: await crm`select id::text from distribuidoras`,
      secoes: await crm`select id::text from catalogo_secoes`,
      vendedores: await crm`select id::text from vendedores`,
      produtos: await crm`select id::text, updated_at, created_at from produtos`,
      pedidos: await crm`select id::text from pedidos`,
      itens: await crm`select id::text from pedido_itens`,
    } as unknown as Destino;

    const p = planejar(f, d);
    const nomes = (rs: Record<string, unknown>[], campo: string) =>
      rs.map((r) => String(r[campo] ?? r["id"])).join(", ") || "-";
    console.log(`usuários novos: ${p.usuariosNovos.length} (${nomes(p.usuariosNovos, "email")})`);
    console.log(
      `usuários editados no Supabase: ${p.usuariosAtualizar.length} (${nomes(p.usuariosAtualizar, "email")})`,
    );
    console.log(`papéis novos: ${p.papeisNovos.length}`);
    console.log(
      `catálogos novos: ${p.catalogosNovos.length} (${nomes(p.catalogosNovos, "nome")}) · seções: ${p.secoesNovas.length} · produtos vinculados: ${p.vinculosNovos.length}`,
    );
    console.log(
      `vendedores novos: ${p.vendedoresNovos.length} (${nomes(p.vendedoresNovos, "nome")})`,
    );
    console.log(
      `produtos novos: ${p.produtosNovos.length} · editados no Supabase: ${p.produtosAtualizar.length} · apagados no Supabase: ${p.produtosApagar.length}`,
    );
    console.log(`pedidos novos: ${p.pedidosNovos.length} · itens: ${p.itensNovos.length}`);

    if (!gravar) {
      console.log("\nSimulação: nada foi gravado. Rode com --gravar para aplicar.");
      return;
    }

    // Cópia do que vai ser alterado ou apagado, para dar para desfazer. Fica fora
    // do repositório (tem hash de senha).
    const ids = (rs: ComId[]) => rs.map((r) => r.id);
    const copia = {
      quando: new Date().toISOString(),
      usuariosAntes:
        await crm`select * from usuarios where id::text in ${crm(ids(p.usuariosAtualizar).concat("-"))}`,
      produtosAntes:
        await crm`select * from produtos where id::text in ${crm(ids(p.produtosAtualizar).concat("-"))}`,
      produtosApagados:
        await crm`select * from produtos where id::text in ${crm(ids(p.produtosApagar).concat("-"))}`,
      vinculosApagados:
        await crm`select * from distribuidora_produtos where produto_id::text in ${crm(ids(p.produtosApagar).concat("-"))}`,
      inseridos: {
        usuarios: ids(p.usuariosNovos),
        user_roles: ids(p.papeisNovos),
        distribuidoras: ids(p.catalogosNovos),
        catalogo_secoes: ids(p.secoesNovas),
        vendedores: ids(p.vendedoresNovos),
        produtos: ids(p.produtosNovos),
        distribuidora_produtos: ids(p.vinculosNovos),
        pedidos: ids(p.pedidosNovos),
        pedido_itens: ids(p.itensNovos),
      },
    };
    const arquivo = join(tmpdir(), `sincronizacao-supabase-${Date.now()}.json`);
    await writeFile(arquivo, JSON.stringify(copia, null, 1));
    console.log(`\nCópia de segurança: ${arquivo}`);

    // Ordem das chaves estrangeiras: quem é referenciado entra antes.
    await crm.begin(async (tx: postgres.TransactionSql) => {
      const lote = async (tabela: string, rs: Record<string, unknown>[], colunas: string[]) => {
        if (rs.length) await tx`insert into ${tx(tabela)} ${tx(rs as never, colunas)}`;
      };
      const R = (rs: unknown[]) => rs as Record<string, unknown>[];

      await lote(
        "usuarios",
        R(p.usuariosNovos).map((u) => ({
          ...u,
          raw_user_meta_data: tx.json((u["raw_user_meta_data"] ?? {}) as never),
          senha_hash: u["encrypted_password"],
        })),
        [
          "id",
          "email",
          "phone",
          "raw_user_meta_data",
          "email_confirmed_at",
          "last_sign_in_at",
          "created_at",
          "updated_at",
          "senha_hash",
        ],
      );
      for (const u of R(p.usuariosAtualizar)) {
        await tx`
          update usuarios
             set email = ${u["email"] as string},
                 phone = ${(u["phone"] as string) ?? null},
                 raw_user_meta_data = ${tx.json((u["raw_user_meta_data"] ?? {}) as never)},
                 email_confirmed_at = ${(u["email_confirmed_at"] as Date) ?? null},
                 senha_hash = ${(u["encrypted_password"] as string) ?? null},
                 last_sign_in_at = greatest(last_sign_in_at, ${(u["last_sign_in_at"] as Date) ?? null}),
                 updated_at = ${u["updated_at"] as Date}
           where id = ${u["id"] as string}`;
      }
      if (p.papeisNovos.length)
        await tx`insert into user_roles ${tx(R(p.papeisNovos) as never, ["id", "user_id", "role", "created_at"])}
                 on conflict (user_id, role) do nothing`;
      await lote("distribuidoras", R(p.catalogosNovos), [
        "id",
        "nome",
        "slug",
        "logo_url",
        "cor",
        "ativo",
        "created_at",
        "updated_at",
        "personalizado",
        "emoji",
        "imagem_url",
      ]);
      await lote("catalogo_secoes", R(p.secoesNovas), [
        "id",
        "distribuidora_id",
        "nome",
        "ordem",
        "created_at",
      ]);
      await lote("vendedores", R(p.vendedoresNovos), [
        "id",
        "nome",
        "slug",
        "whatsapp",
        "distribuidora_id",
        "ativo",
        "created_at",
        "updated_at",
        "user_id",
      ]);
      await lote("produtos", R(p.produtosNovos), [
        "id",
        "codigo",
        "nome",
        "arquivo",
        "ativo",
        "created_at",
        "updated_at",
        "cod_empresa",
      ]);
      for (const r of R(p.produtosAtualizar)) {
        await tx`
          update produtos
             set codigo = ${r["codigo"] as string}, nome = ${r["nome"] as string},
                 arquivo = ${(r["arquivo"] as string) ?? null}, ativo = ${r["ativo"] as boolean},
                 cod_empresa = ${(r["cod_empresa"] as number) ?? null}
           where id = ${r["id"] as string}`;
      }
      await lote("distribuidora_produtos", R(p.vinculosNovos), [
        "id",
        "distribuidora_id",
        "produto_id",
        "created_at",
        "secao_id",
      ]);
      await lote("pedidos", R(p.pedidosNovos), [
        "id",
        "vendedor_id",
        "distribuidora_id",
        "cliente_nome",
        "observacao",
        "total_itens",
        "created_at",
        "origem_hash",
      ]);
      await lote("pedido_itens", R(p.itensNovos), [
        "id",
        "pedido_id",
        "codigo",
        "nome",
        "quantidade",
        "created_at",
        "unidade",
      ]);
      // Vínculos em catálogo saem junto (ON DELETE CASCADE), como no sistema antigo.
      if (p.produtosApagar.length)
        await tx`delete from produtos where id::text in ${tx(ids(p.produtosApagar))}`;
    });
    console.log("Gravado.");
  } finally {
    await supa.end();
    await crm.end();
  }
}

if (import.meta.main) await principal();
