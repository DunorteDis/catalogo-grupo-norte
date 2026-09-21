-- user_roles.user_id era um uuid solto: apagar a conta em auth.users deixava o
-- papel orfao para sempre, e um usuario novo com o mesmo id herdaria o papel.
-- Limpa o que ja ficou para tras e passa a deixar o banco cuidar disso.
DELETE FROM public.user_roles ur
WHERE NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = ur.user_id);

ALTER TABLE public.user_roles
  ADD CONSTRAINT user_roles_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
