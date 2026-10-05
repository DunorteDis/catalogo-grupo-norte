"use client";

import { useParams } from "next/navigation";

import { DetalheDoPedido } from "@/components/pedido-detalhe";

export default function PedidoPage() {
  const { id } = useParams<{ id: string }>();
  return <DetalheDoPedido id={id} voltar="/meus-pedidos" />;
}
