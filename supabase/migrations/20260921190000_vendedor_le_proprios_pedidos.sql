-- Ate aqui so admin lia pedidos, entao o vendedor nao via nem o que caiu no
-- proprio link. Libera a leitura restrita aos pedidos do vendedor logado.
CREATE POLICY "vendedor le proprios pedidos"
ON public.pedidos FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.vendedores v
    WHERE v.id = pedidos.vendedor_id AND v.user_id = auth.uid()
  )
);

CREATE POLICY "vendedor le itens dos proprios pedidos"
ON public.pedido_itens FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.pedidos p
    JOIN public.vendedores v ON v.id = p.vendedor_id
    WHERE p.id = pedido_itens.pedido_id AND v.user_id = auth.uid()
  )
);
