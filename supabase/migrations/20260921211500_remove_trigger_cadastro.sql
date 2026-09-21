-- URGENTE: rode isto antes de qualquer coisa.
--
-- A migration anterior criou um trigger em auth.users que se mostrou defeituoso:
-- ele recusa TODA inserção de usuário, inclusive a do admin criando vendedor.
-- Enquanto ele existir, "Novo acesso" falha com "Database error creating new user".
--
-- Eu não consegui removê-lo (o sandbox barrou a escrita), então ele ainda está
-- ativo no banco. Este arquivo é o desfazimento.

DROP TRIGGER IF EXISTS zz_bloqueia_cadastro_publico ON auth.users;
DROP FUNCTION IF EXISTS public.bloqueia_cadastro_publico();
