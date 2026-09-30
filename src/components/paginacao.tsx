"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { paginaValida, POR_PAGINA } from "@/lib/catalogo";

/**
 * Anterior · "1–10 de 177 · página 1 de 18" · Próxima. `pagina` começa em 0. Some
 * quando não há registro.
 */
export function Paginacao({
  pagina,
  total,
  onMudar,
  porPagina = POR_PAGINA,
}: {
  pagina: number;
  total: number;
  onMudar: (pagina: number) => void;
  porPagina?: number;
}) {
  if (total <= 0) return null;
  const paginas = Math.ceil(total / porPagina);
  const atual = paginaValida(pagina, total, porPagina);
  const inicio = atual * porPagina;
  const n = (v: number) => v.toLocaleString("pt-BR");

  return (
    <div className="flex items-center justify-between gap-3">
      <Button variant="outline" size="sm" disabled={atual === 0} onClick={() => onMudar(atual - 1)}>
        <ChevronLeft />
        Anterior
      </Button>
      <span className="text-center text-xs text-ink-muted tabular-nums">
        {n(inicio + 1)}–{n(Math.min(inicio + porPagina, total))} de {n(total)} · página{" "}
        {n(atual + 1)} de {n(paginas)}
      </span>
      <Button
        variant="outline"
        size="sm"
        disabled={atual >= paginas - 1}
        onClick={() => onMudar(atual + 1)}
      >
        Próxima
        <ChevronRight />
      </Button>
    </div>
  );
}
