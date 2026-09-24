import { CalendarDays, Loader2 } from "lucide-react";

import { ATALHOS, paraInput, type Atalho } from "@/lib/periodo";
import { FilterTabs } from "@/components/abastex";
import { Input } from "@/components/ui/input";

export type EstadoPeriodo = {
  atalho: Atalho;
  de: string;
  ate: string;
};

/** Painel abre em 30 dias (tendencia); telas de lista abrem em hoje. */
export function periodoInicial(atalho: Atalho = "hoje"): EstadoPeriodo {
  const hoje = paraInput(new Date());
  const a = ATALHOS.find((x) => x.id === atalho);
  return { atalho, de: a ? a.de() : hoje, ate: hoje };
}

const OPCOES = [
  ...ATALHOS.map((a) => ({ value: a.id as Atalho, label: a.label })),
  { value: "personalizado" as Atalho, label: "Período", icon: CalendarDays },
];

export function FiltroPeriodo({
  valor,
  onChange,
  carregando,
}: {
  valor: EstadoPeriodo;
  onChange: (v: EstadoPeriodo) => void;
  carregando?: boolean;
}) {
  function escolher(id: Atalho) {
    const a = ATALHOS.find((x) => x.id === id);
    onChange(a ? { atalho: id, de: a.de(), ate: paraInput(new Date()) } : { ...valor, atalho: id });
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {carregando && (
        <Loader2 className="size-4 animate-spin text-ink-subtle" aria-label="Carregando" />
      )}
      {valor.atalho === "personalizado" && (
        <>
          <Input
            aria-label="De"
            type="date"
            value={valor.de}
            max={valor.ate}
            onChange={(e) => onChange({ ...valor, de: e.target.value })}
            className="w-40"
          />
          <Input
            aria-label="Até"
            type="date"
            value={valor.ate}
            min={valor.de}
            onChange={(e) => onChange({ ...valor, ate: e.target.value })}
            className="w-40"
          />
        </>
      )}
      <FilterTabs options={OPCOES} value={valor.atalho} onChange={escolher} />
    </div>
  );
}
