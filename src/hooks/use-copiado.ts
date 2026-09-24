import { useEffect, useState } from "react";

/**
 * Copia um texto e marca a chave como copiada por 1,5 s — o DS troca o ícone
 * por um check nesse tempo, sem toast.
 */
export function useCopiado() {
  const [copiado, setCopiado] = useState<string | null>(null);
  useEffect(() => {
    if (!copiado) return;
    const t = setTimeout(() => setCopiado(null), 1500);
    return () => clearTimeout(t);
  }, [copiado]);

  function copiar(chave: string, texto: string) {
    navigator.clipboard.writeText(texto);
    setCopiado(chave);
  }

  return [copiado, copiar] as const;
}
