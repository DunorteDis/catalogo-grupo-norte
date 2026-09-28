import { useEffect, useState } from "react";
import { toast } from "sonner";

import { copiarTexto } from "@/lib/copiar";

/**
 * Copia um texto e marca a chave como copiada por 1,5 s — o DS troca o ícone
 * por um check nesse tempo, sem toast. Se a cópia falhar, avisa.
 */
export function useCopiado() {
  const [copiado, setCopiado] = useState<string | null>(null);
  useEffect(() => {
    if (!copiado) return;
    const t = setTimeout(() => setCopiado(null), 1500);
    return () => clearTimeout(t);
  }, [copiado]);

  async function copiar(chave: string, texto: string) {
    if (await copiarTexto(texto)) setCopiado(chave);
    else toast.error("Não foi possível copiar. Tente de novo.");
  }

  return [copiado, copiar] as const;
}
