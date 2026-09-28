// Traz para o crm o que mudou no Supabase (sistema antigo, ainda no ar) desde a
// cópia inicial: pedidos, usuários e catálogos que só existem lá.
//
// Roda com: bun scripts/sincronizar-supabase.ts            (só simula e mostra o plano)
//           bun scripts/sincronizar-supabase.ts --gravar   (grava, numa transação só)
// Precisa de SUPABASE_DB_URL e PG* no .env. Pode rodar de novo antes da virada:
// só insere o que falta e só atualiza o que foi editado depois no Supabase.
//
// Regras:
// - Registro novo no Supabase (id que o crm não tem) entra.
// - Usuário nos dois: vale o mais recente pelo updated_at.
// - Catálogo que só existe no Supabase entra inteiro: seções e produtos vinculados
//   (só os vínculos de produto que existe no crm).
// - Produto NÃO vem daqui: a base é a system.pcprodut, sincronizada todo dia por
//   crm.sincronizar_produtos() (db/migrations/002 e 003).
// - Pedido, usuário e vendedor nunca são apagados.
import { writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import postgres from "postgres";

type ComId = { id: string };
type ComData = ComId & { updated_at: Date };

export type Fonte = {
  usuarios: ComData[];
  papeis: ComId[];
  catalogos: ComId[];
  secoes: (ComId & { distribuidora_id: string })[];
  vendedores: ComId[];
  vinculos: (ComId & { distribuidora_id: string; produto_id: string })[];
  pedidos: ComId[];
  itens: ComId[];
};
export type Destino = {
  usuarios: ComData[];
  papeis: ComId[];
  catalogos: ComId[];
  secoes: ComId[];
  vendedores: ComId[];
  produtos: ComId[];
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
  const produtosNoCrm = tem(d.produtos);
  const vinculosDosNovos = f.vinculos.filter((v) => idsCatalogosNovos.has(v.distribuidora_id));
  return {
    usuariosNovos: novos(f.usuarios, d.usuarios),
    usuariosAtualizar: maisNovos(f.usuarios, d.usuarios),
    papeisNovos: novos(f.papeis, d.papeis),
    catalogosNovos,
    secoesNovas: novos(f.secoes, d.secoes).filter((s) => idsCatalogosNovos.has(s.distribuidora_id)),
    vendedoresNovos: novos(f.vendedores, d.vendedores),
    // Produto é do ERP: vínculo com produto que o crm não tem fica de fora.
    vinculosNovos: vinculosDosNovos.filter((v) => produtosNoCrm.has(v.produto_id)),
    vinculosSemProduto: vinculosDosNovos.filter((v) => !produtosNoCrm.has(v.produto_id)),
    pedidosNovos: novos(f.pedidos, d.pedidos),
    itensNovos: novos(f.itens, d.itens),
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
      vinculos:
        await supa`select *, produto_id::text as produto_id from public.distribuidora_produtos`,
      pedidos: await supa`select * from public.pedidos`,
      itens: await supa`select * from public.pedido_itens`,
    } as unknown as Fonte & Record<string, Record<string, unknown>[]>;
    const d = {
      usuarios: await crm`select id::text, updated_at from usuarios`,
      papeis: await crm`select id::text from user_roles`,
      catalogos: await crm`select id::text from distribuidoras`,
      secoes: await crm`select id::text from catalogo_secoes`,
      vendedores: await crm`select id::text from vendedores`,
      produtos: await crm`select id::text from produtos`,
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
      `catálogos novos: ${p.catalogosNovos.length} (${nomes(p.catalogosNovos, "nome")}) · seções: ${p.secoesNovas.length} · produtos vinculados: ${p.vinculosNovos.length}` +
        (p.vinculosSemProduto.length
          ? ` (${p.vinculosSemProduto.length} de fora: produto que não está no crm)`
          : ""),
    );
    console.log(
      `vendedores novos: ${p.vendedoresNovos.length} (${nomes(p.vendedoresNovos, "nome")})`,
    );
    console.log(`pedidos novos: ${p.pedidosNovos.length} · itens: ${p.itensNovos.length}`);

    if (!gravar) {
      console.log("\nSimulação: nada foi gravado. Rode com --gravar para aplicar.");
      return;
    }

    // Cópia do que vai ser alterado, para dar para desfazer. Fica fora do
    // repositório (tem hash de senha).
    const ids = (rs: ComId[]) => rs.map((r) => r.id);
    const copia = {
      quando: new Date().toISOString(),
      usuariosAntes:
        await crm`select * from usuarios where id::text in ${crm(ids(p.usuariosAtualizar).concat("-"))}`,
      inseridos: {
        usuarios: ids(p.usuariosNovos),
        user_roles: ids(p.papeisNovos),
        distribuidoras: ids(p.catalogosNovos),
        catalogo_secoes: ids(p.secoesNovas),
        vendedores: ids(p.vendedoresNovos),
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
    });
    console.log("Gravado.");
  } finally {
    await supa.end();
    await crm.end();
  }
}

if (import.meta.main) await principal();
