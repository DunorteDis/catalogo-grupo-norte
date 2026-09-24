"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Warehouse } from "lucide-react";
import { toast } from "sonner";

import { chamar } from "@/lib/chamar";
import { mensagemErro } from "@/lib/erros";
import { Badge, DistributorCard, PageHeader } from "@/components/abastex";
import { LOGOS } from "@/lib/logos";
import { ativarCatalogo, listarDistribuidoras } from "@/server/catalogos";

export default function DistribuidorasPage() {
  const qc = useQueryClient();

  const { data } = useQuery({
    queryKey: ["admin-distribuidoras-full"],
    queryFn: () => chamar(listarDistribuidoras()),
  });

  const alternar = useMutation({
    mutationFn: ({ id, ativo }: { id: string; ativo: boolean }) =>
      chamar(ativarCatalogo(id, ativo)),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-distribuidoras-full"] }),
    onError: (e: Error) => toast.error(mensagemErro(e)),
  });

  const lista = data ?? [];
  const ativas = lista.filter((d) => d.ativo).length;
  const inativas = lista.length - ativas;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        crumbs={["Abastex", "Distribuidoras"]}
        icon={Warehouse}
        tone="info"
        title="Distribuidoras"
        subtitle="Desligue uma distribuidora para tirar o catálogo dela do ar para todos os vendedores."
        actions={
          data && (
            <>
              <Badge tone="accent" icon={Check}>
                {ativas} {ativas === 1 ? "ativa" : "ativas"}
              </Badge>
              {inativas > 0 && (
                <Badge dot>
                  {inativas} {inativas === 1 ? "inativa" : "inativas"}
                </Badge>
              )}
            </>
          )
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {lista.map((d) => (
          <DistributorCard
            key={d.id}
            name={d.nome}
            color={d.cor}
            active={!!d.ativo}
            onToggle={(v) => alternar.mutate({ id: d.id, ativo: v })}
            logo={LOGOS[d.slug] ? <img src={LOGOS[d.slug]} alt={d.nome} /> : undefined}
          />
        ))}
      </div>
    </div>
  );
}
