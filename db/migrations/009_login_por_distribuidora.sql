-- Login por distribuidora (docs/superpowers/specs/2026-09-29-login-por-distribuidora-design.md).
-- Até aqui uma linha de distribuidoras era a marca E o catálogo da Abastex; agora o
-- catálogo mora em crm.catalogos (dona + marca opcional) e distribuidoras guarda só
-- distribuidoras. Tudo o que existe passa a ser da Abastex; eduardo.oliveira vira TI.
--
-- Precisa da 008 aplicada. Aplicar com: bun scripts/aplicar-sql.ts <este arquivo>
-- Ensaiar (desfaz no fim): bun scripts/aplicar-sql.ts --ensaio <este arquivo>
-- Voltar atrás: db/restaurar-backup-20260929.sql
-- Um arquivo = uma transação: se qualquer conferência falhar, nada muda.

-- 1. Ninguém escreve nessas tabelas até o fim.
LOCK TABLE crm.distribuidoras, crm.distribuidora_produtos, crm.catalogo_secoes, crm.pedidos,
  crm.pedido_itens, crm.vendedores, crm.usuarios, crm.user_roles IN ACCESS EXCLUSIVE MODE;

-- 2. Cópia de segurança do momento exato da virada.
CREATE SCHEMA crm_backup_20260929;
CREATE TABLE crm_backup_20260929.distribuidoras AS SELECT * FROM crm.distribuidoras;
CREATE TABLE crm_backup_20260929.distribuidora_produtos AS SELECT * FROM crm.distribuidora_produtos;
CREATE TABLE crm_backup_20260929.catalogo_secoes AS SELECT * FROM crm.catalogo_secoes;
CREATE TABLE crm_backup_20260929.pedidos AS SELECT * FROM crm.pedidos;
CREATE TABLE crm_backup_20260929.pedido_itens AS SELECT * FROM crm.pedido_itens;
CREATE TABLE crm_backup_20260929.vendedores AS SELECT * FROM crm.vendedores;
CREATE TABLE crm_backup_20260929.usuarios AS SELECT * FROM crm.usuarios;
CREATE TABLE crm_backup_20260929.user_roles AS SELECT * FROM crm.user_roles;

-- 3 e 4. Pré-condições: Abastex e eduardo.oliveira existem; só catálogo conhecido tem dado.
DO $$
DECLARE estranhas text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM crm.distribuidoras WHERE slug = 'abastex') THEN
    RAISE EXCEPTION 'Distribuidora abastex não encontrada: cadastre na tela Distribuidoras antes.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM crm.usuarios
                  WHERE lower(email) = 'eduardo.oliveira@acesso.gruponorte.com.br') THEN
    RAISE EXCEPTION 'Usuário eduardo.oliveira não encontrado.';
  END IF;
  SELECT string_agg(d.nome, ', ') INTO estranhas
    FROM crm.distribuidoras d
   WHERE NOT (d.personalizado OR d.slug IN ('dunorte', 'elonorte', 'gruponorte', 'metanorte',
                                            'mixnorte', 'rotanorte', 'supergiro'))
     AND (EXISTS (SELECT 1 FROM crm.distribuidora_produtos x WHERE x.distribuidora_id = d.id)
       OR EXISTS (SELECT 1 FROM crm.catalogo_secoes x WHERE x.distribuidora_id = d.id)
       OR EXISTS (SELECT 1 FROM crm.pedidos x WHERE x.distribuidora_id = d.id));
  IF estranhas IS NOT NULL THEN
    RAISE EXCEPTION 'Estas linhas têm produto, seção ou pedido e não são catálogo conhecido: %', estranhas;
  END IF;
END $$;

-- 5. Catálogos, com o mesmo id da linha que eram.
CREATE TABLE crm.catalogos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  distribuidora_id uuid NOT NULL REFERENCES crm.distribuidoras(id) ON DELETE RESTRICT,
  marca_id uuid REFERENCES crm.distribuidoras(id) ON DELETE RESTRICT,
  slug text NOT NULL,
  nome text,
  cor text,
  emoji text,
  imagem_url text,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  -- De marca lê nome e cor da marca; personalizado precisa dos seus.
  CONSTRAINT catalogos_marca_ou_nome CHECK (marca_id IS NOT NULL OR (nome IS NOT NULL AND cor IS NOT NULL)),
  CONSTRAINT catalogos_slug_por_dona UNIQUE (distribuidora_id, slug),
  CONSTRAINT catalogos_marca_por_dona UNIQUE (distribuidora_id, marca_id)
);
CREATE TRIGGER catalogos_updated BEFORE UPDATE ON crm.catalogos
  FOR EACH ROW EXECUTE FUNCTION crm.set_updated_at();

INSERT INTO crm.catalogos (id, distribuidora_id, marca_id, slug, nome, cor, emoji, imagem_url,
                           ativo, created_at, updated_at)
SELECT d.id,
       (SELECT id FROM crm.distribuidoras WHERE slug = 'abastex'),
       CASE WHEN d.personalizado THEN NULL ELSE d.id END,
       d.slug,
       CASE WHEN d.personalizado THEN d.nome END,
       CASE WHEN d.personalizado THEN d.cor END,
       CASE WHEN d.personalizado THEN d.emoji END,
       CASE WHEN d.personalizado THEN d.imagem_url END,
       d.ativo, d.created_at, d.updated_at
  FROM crm.distribuidoras d
 WHERE d.personalizado OR d.slug IN ('dunorte', 'elonorte', 'gruponorte', 'metanorte',
                                     'mixnorte', 'rotanorte', 'supergiro');

-- 6. Seções, vínculos e pedidos passam a apontar para catalogos. Os valores não mudam.
ALTER TABLE crm.catalogo_secoes DROP CONSTRAINT catalogo_secoes_distribuidora_id_fkey;
ALTER TABLE crm.catalogo_secoes RENAME COLUMN distribuidora_id TO catalogo_id;
ALTER TABLE crm.catalogo_secoes
  RENAME CONSTRAINT catalogo_secoes_distribuidora_id_nome_key TO catalogo_secoes_catalogo_id_nome_key;
ALTER TABLE crm.catalogo_secoes ADD CONSTRAINT catalogo_secoes_catalogo_id_fkey
  FOREIGN KEY (catalogo_id) REFERENCES crm.catalogos(id) ON DELETE CASCADE;

ALTER TABLE crm.distribuidora_produtos DROP CONSTRAINT distribuidora_produtos_distribuidora_id_fkey;
ALTER TABLE crm.distribuidora_produtos RENAME COLUMN distribuidora_id TO catalogo_id;
ALTER TABLE crm.distribuidora_produtos RENAME CONSTRAINT
  distribuidora_produtos_distribuidora_id_produto_id_key TO distribuidora_produtos_catalogo_id_produto_id_key;
ALTER INDEX crm.dp_distribuidora_idx RENAME TO dp_catalogo_idx;
ALTER TABLE crm.distribuidora_produtos ADD CONSTRAINT distribuidora_produtos_catalogo_id_fkey
  FOREIGN KEY (catalogo_id) REFERENCES crm.catalogos(id) ON DELETE CASCADE;

ALTER TABLE crm.pedidos DROP CONSTRAINT pedidos_distribuidora_id_fkey;
ALTER TABLE crm.pedidos RENAME COLUMN distribuidora_id TO catalogo_id;
ALTER TABLE crm.pedidos ADD CONSTRAINT pedidos_catalogo_id_fkey
  FOREIGN KEY (catalogo_id) REFERENCES crm.catalogos(id) ON DELETE SET NULL;

-- 7. Dona do pedido, gravada nele: excluir o catálogo não tira o pedido da distribuidora.
ALTER TABLE crm.pedidos ADD COLUMN distribuidora_id uuid
  REFERENCES crm.distribuidoras(id) ON DELETE RESTRICT;
UPDATE crm.pedidos SET distribuidora_id = (SELECT id FROM crm.distribuidoras WHERE slug = 'abastex');
ALTER TABLE crm.pedidos ALTER COLUMN distribuidora_id SET NOT NULL;

-- 8. Pessoas.
ALTER TABLE crm.usuarios ADD COLUMN distribuidora_id uuid
  REFERENCES crm.distribuidoras(id) ON DELETE RESTRICT;
UPDATE crm.usuarios SET distribuidora_id = (SELECT id FROM crm.distribuidoras WHERE slug = 'abastex')
 WHERE lower(email) <> 'eduardo.oliveira@acesso.gruponorte.com.br';

ALTER TABLE crm.vendedores DROP CONSTRAINT vendedores_distribuidora_id_fkey;
UPDATE crm.vendedores SET distribuidora_id = (SELECT id FROM crm.distribuidoras WHERE slug = 'abastex');
ALTER TABLE crm.vendedores ALTER COLUMN distribuidora_id SET NOT NULL;
ALTER TABLE crm.vendedores ADD CONSTRAINT vendedores_distribuidora_id_fkey
  FOREIGN KEY (distribuidora_id) REFERENCES crm.distribuidoras(id) ON DELETE RESTRICT;

-- 9. eduardo.oliveira: TI, sem distribuidora (o TI já faz tudo que o admin faz).
INSERT INTO crm.user_roles (user_id, role)
SELECT id, 'ti' FROM crm.usuarios WHERE lower(email) = 'eduardo.oliveira@acesso.gruponorte.com.br'
ON CONFLICT (user_id, role) DO NOTHING;
DELETE FROM crm.user_roles
 WHERE role = 'admin'
   AND user_id = (SELECT id FROM crm.usuarios
                   WHERE lower(email) = 'eduardo.oliveira@acesso.gruponorte.com.br');

-- 10. Só agora, com as FKs trocadas: os personalizados saem de distribuidoras. Antes da
-- troca, o ON DELETE CASCADE levaria produtos e seções junto.
DELETE FROM crm.distribuidoras WHERE personalizado;

-- 11. Conferência contra a cópia: qualquer diferença desfaz tudo.
DO $$
DECLARE
  n_cat int; n_esperado int; n_vinc int; n_sec int; n_ped int; n_itens int; n_vend int; n_usu int;
BEGIN
  SELECT count(*) INTO n_vinc FROM crm.distribuidora_produtos;
  IF n_vinc <> (SELECT count(*) FROM crm_backup_20260929.distribuidora_produtos) THEN
    RAISE EXCEPTION 'Vínculos de produto: a contagem mudou.';
  END IF;
  IF EXISTS (SELECT 1 FROM crm.distribuidora_produtos x
               JOIN crm_backup_20260929.distribuidora_produtos b ON b.id = x.id
              WHERE x.catalogo_id <> b.distribuidora_id OR x.produto_id <> b.produto_id
                 OR x.secao_id IS DISTINCT FROM b.secao_id) THEN
    RAISE EXCEPTION 'Vínculos de produto: algum mudou de catálogo, produto ou seção.';
  END IF;

  SELECT count(*) INTO n_sec FROM crm.catalogo_secoes;
  IF n_sec <> (SELECT count(*) FROM crm_backup_20260929.catalogo_secoes) THEN
    RAISE EXCEPTION 'Seções: a contagem mudou.';
  END IF;
  IF EXISTS (SELECT 1 FROM crm.catalogo_secoes x JOIN crm_backup_20260929.catalogo_secoes b ON b.id = x.id
              WHERE x.catalogo_id <> b.distribuidora_id OR x.nome <> b.nome) THEN
    RAISE EXCEPTION 'Seções: alguma mudou de catálogo ou de nome.';
  END IF;

  SELECT count(*) INTO n_ped FROM crm.pedidos;
  IF n_ped <> (SELECT count(*) FROM crm_backup_20260929.pedidos) THEN
    RAISE EXCEPTION 'Pedidos: a contagem mudou.';
  END IF;
  IF EXISTS (SELECT 1 FROM crm.pedidos x JOIN crm_backup_20260929.pedidos b ON b.id = x.id
              WHERE x.catalogo_id IS DISTINCT FROM b.distribuidora_id
                 OR x.vendedor_id IS DISTINCT FROM b.vendedor_id) THEN
    RAISE EXCEPTION 'Pedidos: algum mudou de catálogo ou de vendedor.';
  END IF;

  SELECT count(*) INTO n_itens FROM crm.pedido_itens;
  IF n_itens <> (SELECT count(*) FROM crm_backup_20260929.pedido_itens) THEN
    RAISE EXCEPTION 'Itens de pedido: a contagem mudou.';
  END IF;

  SELECT count(*) INTO n_vend FROM crm.vendedores;
  SELECT count(*) INTO n_usu FROM crm.usuarios;
  IF n_vend <> (SELECT count(*) FROM crm_backup_20260929.vendedores)
     OR n_usu <> (SELECT count(*) FROM crm_backup_20260929.usuarios) THEN
    RAISE EXCEPTION 'Vendedores ou usuários: a contagem mudou.';
  END IF;

  SELECT count(*) INTO n_cat FROM crm.catalogos;
  SELECT count(*) INTO n_esperado FROM crm_backup_20260929.distribuidoras
   WHERE personalizado OR slug IN ('dunorte', 'elonorte', 'gruponorte', 'metanorte',
                                   'mixnorte', 'rotanorte', 'supergiro');
  IF n_cat <> n_esperado THEN
    RAISE EXCEPTION 'Catálogos: % criados, % esperados.', n_cat, n_esperado;
  END IF;

  IF EXISTS (SELECT 1 FROM crm.usuarios u
              WHERE u.distribuidora_id IS NULL
                AND NOT EXISTS (SELECT 1 FROM crm.user_roles r WHERE r.user_id = u.id AND r.role = 'ti')) THEN
    RAISE EXCEPTION 'Há usuário sem distribuidora que não é TI.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM crm.user_roles WHERE role = 'ti') THEN
    RAISE EXCEPTION 'Nenhum usuário ficou com o papel TI.';
  END IF;

  RAISE NOTICE 'Conferido: % catálogos, % vínculos, % seções, % pedidos, % itens, % vendedores, % usuários.',
    n_cat, n_vinc, n_sec, n_ped, n_itens, n_vend, n_usu;
END $$;
