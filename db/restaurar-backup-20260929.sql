-- Desfaz a 009 (login por distribuidora): volta o crm ao formato de antes, usando a
-- cópia crm_backup_20260929 feita por ela. Só se a virada der errado, junto com a
-- volta do código antigo no deploy:
--   bun scripts/aplicar-sql.ts db/restaurar-backup-20260929.sql
-- Ensaiar junto com a 009 (desfaz tudo no fim):
--   bun scripts/aplicar-sql.ts --ensaio db/migrations/009_login_por_distribuidora.sql db/restaurar-backup-20260929.sql
--
-- Mantém o que entrou depois da virada e cabe no formato antigo (pedidos, vínculos,
-- seções, usuários da Abastex, edições e liga/desliga de catálogos). Aborta se houver
-- catálogo criado depois da virada (não tem linha em distribuidoras) ou usuário ou
-- vendedor de outra distribuidora (no formato antigo ele veria tudo da Abastex): os
-- dois precisam de decisão caso a caso. O valor 'ti' fica no enum (o Postgres não
-- remove valor de enum), sem ninguém com ele.
--
-- Depois de restaurar, a 009 só roda de novo quando crm_backup_20260929 for apagado
-- ou renomeado (o CREATE SCHEMA dela falha): é isso que protege a cópia.

LOCK TABLE crm.catalogos, crm.distribuidoras, crm.distribuidora_produtos, crm.catalogo_secoes,
  crm.pedidos, crm.vendedores, crm.usuarios, crm.user_roles IN ACCESS EXCLUSIVE MODE;

DO $$
DECLARE novos text; outros text;
BEGIN
  SELECT string_agg(c.slug, ', ') INTO novos FROM crm.catalogos c
   WHERE NOT EXISTS (SELECT 1 FROM crm_backup_20260929.distribuidoras b WHERE b.id = c.id);
  IF novos IS NOT NULL THEN
    RAISE EXCEPTION 'Catálogos criados depois da virada, sem lugar no formato antigo: %', novos;
  END IF;
  SELECT string_agg(x.quem, ', ') INTO outros FROM (
    SELECT u.email AS quem FROM crm.usuarios u
     WHERE u.distribuidora_id IS DISTINCT FROM (SELECT id FROM crm.distribuidoras WHERE slug = 'abastex')
       AND NOT EXISTS (SELECT 1 FROM crm.user_roles r WHERE r.user_id = u.id AND r.role = 'ti')
    UNION ALL
    SELECT v.slug FROM crm.vendedores v
     WHERE v.distribuidora_id <> (SELECT id FROM crm.distribuidoras WHERE slug = 'abastex')) x;
  IF outros IS NOT NULL THEN
    RAISE EXCEPTION 'Usuários ou vendedores de outra distribuidora (no formato antigo veriam tudo): %', outros;
  END IF;
END $$;

-- Os personalizados voltam para distribuidoras como estão agora em catalogos: edição e
-- liga/desliga feitos depois da virada ficam. Personalizado excluído depois não volta.
INSERT INTO crm.distribuidoras (id, nome, slug, cor, ativo, personalizado, emoji, imagem_url,
                                created_at, updated_at)
SELECT id, nome, slug, cor, ativo, true, emoji, imagem_url, created_at, updated_at
  FROM crm.catalogos WHERE marca_id IS NULL;

-- Catálogo de marca desligado depois da virada: no formato antigo o liga/desliga era um só.
UPDATE crm.distribuidoras d SET ativo = d.ativo AND c.ativo
  FROM crm.catalogos c WHERE c.id = d.id AND c.marca_id = d.id;

ALTER TABLE crm.catalogo_secoes DROP CONSTRAINT catalogo_secoes_catalogo_id_fkey;
ALTER TABLE crm.catalogo_secoes RENAME COLUMN catalogo_id TO distribuidora_id;
ALTER TABLE crm.catalogo_secoes
  RENAME CONSTRAINT catalogo_secoes_catalogo_id_nome_key TO catalogo_secoes_distribuidora_id_nome_key;
ALTER TABLE crm.catalogo_secoes ADD CONSTRAINT catalogo_secoes_distribuidora_id_fkey
  FOREIGN KEY (distribuidora_id) REFERENCES crm.distribuidoras(id) ON DELETE CASCADE;

ALTER TABLE crm.distribuidora_produtos DROP CONSTRAINT distribuidora_produtos_catalogo_id_fkey;
ALTER TABLE crm.distribuidora_produtos RENAME COLUMN catalogo_id TO distribuidora_id;
ALTER TABLE crm.distribuidora_produtos RENAME CONSTRAINT
  distribuidora_produtos_catalogo_id_produto_id_key TO distribuidora_produtos_distribuidora_id_produto_id_key;
ALTER INDEX crm.dp_catalogo_idx RENAME TO dp_distribuidora_idx;
ALTER TABLE crm.distribuidora_produtos ADD CONSTRAINT distribuidora_produtos_distribuidora_id_fkey
  FOREIGN KEY (distribuidora_id) REFERENCES crm.distribuidoras(id) ON DELETE CASCADE;

-- A coluna nova (dona) sai antes: o nome distribuidora_id volta para o catálogo.
ALTER TABLE crm.pedidos DROP COLUMN distribuidora_id;
ALTER TABLE crm.pedidos DROP CONSTRAINT pedidos_catalogo_id_fkey;
ALTER TABLE crm.pedidos RENAME COLUMN catalogo_id TO distribuidora_id;
ALTER TABLE crm.pedidos ADD CONSTRAINT pedidos_distribuidora_id_fkey
  FOREIGN KEY (distribuidora_id) REFERENCES crm.distribuidoras(id) ON DELETE SET NULL;

ALTER TABLE crm.usuarios DROP COLUMN distribuidora_id;

ALTER TABLE crm.vendedores DROP CONSTRAINT vendedores_distribuidora_id_fkey;
ALTER TABLE crm.vendedores ALTER COLUMN distribuidora_id DROP NOT NULL;
UPDATE crm.vendedores SET distribuidora_id = NULL;
ALTER TABLE crm.vendedores ADD CONSTRAINT vendedores_distribuidora_id_fkey
  FOREIGN KEY (distribuidora_id) REFERENCES crm.distribuidoras(id) ON DELETE CASCADE;

INSERT INTO crm.user_roles (user_id, role)
SELECT user_id, 'admin' FROM crm.user_roles WHERE role = 'ti'
ON CONFLICT (user_id, role) DO NOTHING;
DELETE FROM crm.user_roles WHERE role = 'ti';

DROP TABLE crm.catalogos;

DO $$
BEGIN
  RAISE NOTICE 'Restaurado: % linhas em distribuidoras, % vínculos, % seções, % pedidos.',
    (SELECT count(*) FROM crm.distribuidoras), (SELECT count(*) FROM crm.distribuidora_produtos),
    (SELECT count(*) FROM crm.catalogo_secoes), (SELECT count(*) FROM crm.pedidos);
END $$;
