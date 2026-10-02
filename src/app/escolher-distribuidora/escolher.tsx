"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { Check, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { chamar } from "@/lib/chamar";
import { mensagemErro } from "@/lib/erros";
import { LOGOS } from "@/lib/logos";
import { distribuidorasParaEscolher, escolherDistribuidora } from "@/server/auth";

export function Escolher({ atual }: { atual: string | null }) {
  const router = useRouter();
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ["distribuidoras-para-escolher"],
    queryFn: () => chamar(distribuidorasParaEscolher()),
  });

  const escolher = useMutation({
    mutationFn: (id: string) => chamar(escolherDistribuidora(id)),
    onSuccess: (destino) => {
      // Tudo em cache era da distribuidora anterior.
      qc.clear();
      router.replace(destino);
      router.refresh();
    },
    onError: (e: Error) => toast.error(mensagemErro(e)),
  });

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col justify-center gap-6 px-4 py-12">
      <div>
        <p className="text-[0.6875rem] font-semibold uppercase tracking-[0.12em] text-ink-muted">
          TI
        </p>
        <h1 className="mt-1 text-2xl font-bold text-ink">Em qual distribuidora você vai entrar?</h1>
        <p className="mt-1 text-sm text-ink-muted">
          Dá para trocar depois pelo menu. Usuários, catálogos e pedidos são os dela.
        </p>
      </div>
      {!data ? (
        <Loader2 className="size-6 animate-spin text-ink-subtle" />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {data.map((d) => {
            const logo = LOGOS[d.slug] ?? d.logo_url;
            return (
              <button
                key={d.id}
                type="button"
                disabled={escolher.isPending}
                onClick={() => escolher.mutate(d.id)}
                className="ax-card relative flex h-24 cursor-pointer items-center justify-center p-4 transition hover:shadow-md disabled:opacity-60"
              >
                {logo ? (
                  <img
                    src={logo}
                    alt={d.nome}
                    className="max-h-14 w-auto max-w-full object-contain"
                  />
                ) : (
                  <span className="text-lg font-bold" style={{ color: d.cor }}>
                    {d.nome}
                  </span>
                )}
                {d.id === atual && (
                  <Check
                    className="absolute right-3 top-3 size-4 text-mint-ink"
                    aria-label="Atual"
                  />
                )}
              </button>
            );
          })}
        </div>
      )}
    </main>
  );
}
