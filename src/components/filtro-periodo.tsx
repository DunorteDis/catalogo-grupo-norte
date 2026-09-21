import { Loader2 } from "lucide-react";

import { ATALHOS, paraInput, type Atalho } from "@/lib/periodo";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

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

  const botao = (id: Atalho, label: string) => (
    <button
      key={id}
      type="button"
      onClick={() => escolher(id)}
      className={cn(
        "rounded-xl px-3.5 py-2 text-sm font-semibold transition-colors",
        valor.atalho === id
          ? "bg-primary text-primary-foreground"
          : "bg-muted text-muted-foreground hover:bg-muted/70",
      )}
    >
      {label}
    </button>
  );

  return (
    <div className="flex flex-wrap items-end gap-3 rounded-2xl border bg-card p-4">
      <div className="flex flex-wrap gap-1.5">
        {ATALHOS.map((a) => botao(a.id, a.label))}
        {botao("personalizado", "Período")}
      </div>

      {valor.atalho === "personalizado" && (
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <Label htmlFor="de" className="text-xs text-muted-foreground">
              De
            </Label>
            <Input
              id="de"
              type="date"
              value={valor.de}
              max={valor.ate}
              onChange={(e) => onChange({ ...valor, de: e.target.value })}
              className="h-10 w-40 rounded-xl"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="ate" className="text-xs text-muted-foreground">
              Até
            </Label>
            <Input
              id="ate"
              type="date"
              value={valor.ate}
              min={valor.de}
              onChange={(e) => onChange({ ...valor, ate: e.target.value })}
              className="h-10 w-40 rounded-xl"
            />
          </div>
        </div>
      )}

      {carregando && (
        <Loader2 className="mb-2 ml-auto h-4 w-4 animate-spin text-muted-foreground" />
      )}
    </div>
  );
}
