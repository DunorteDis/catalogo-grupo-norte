-- Catálogo personalizado com imagem no lugar do emoji.
--
-- Coluna nova em vez de reaproveitar logo_url: aquela guarda caminhos de asset
-- do Lovable (/__l5e/...) que não existem mais, e as logos das distribuidoras
-- vêm do build (src/lib/logos.ts). imagem_url é só o que o admin enviou.
ALTER TABLE public.distribuidoras ADD COLUMN IF NOT EXISTS imagem_url text;

-- Bucket público: a imagem aparece para o cliente sem login, direto pela URL.
-- Tipo e tamanho barrados aqui também, não só no formulário. SVG fica de fora:
-- aberto direto no navegador, roda script.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('catalogos', 'catalogos', true, 2097152,
        ARRAY['image/png', 'image/jpeg', 'image/webp', 'image/gif'])
ON CONFLICT (id) DO NOTHING;

-- Só admin grava. Ler não precisa de policy (bucket público serve pela URL), e
-- sem policy de SELECT ninguém lista o que tem no bucket.
DROP POLICY IF EXISTS "admin envia imagem de catalogo" ON storage.objects;
CREATE POLICY "admin envia imagem de catalogo" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'catalogos' AND public.has_role(auth.uid(), 'admin'));
