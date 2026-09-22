import { LOGOS } from "@/lib/logos";
import { cn } from "@/lib/utils";

export type Marca = {
  slug: string;
  nome: string;
  cor: string;
  emoji?: string | null;
};

/**
 * Como um catálogo se apresenta: logo da distribuidora quando existe (asset
 * resolvido em build por slug) e, para o catálogo personalizado — que nasce no
 * painel, sem deploy —, emoji + nome na cor escolhida.
 *
 * ponytail: esse mesmo `if` vivia copiado no painel do vendedor, na escolha do
 * cliente e no cabeçalho do catálogo. Agora é um lugar só.
 */
export function MarcaCatalogo({
  marca,
  logoClassName,
  className,
}: {
  marca: Marca;
  logoClassName?: string;
  className?: string;
}) {
  const logo = LOGOS[marca.slug];
  if (logo) {
    return (
      <img
        src={logo}
        alt={marca.nome}
        className={cn("w-auto max-w-full object-contain", logoClassName)}
      />
    );
  }
  return (
    <span
      className={cn("inline-flex items-center gap-2 font-extrabold", className)}
      style={{ color: marca.cor }}
    >
      {marca.emoji && <span aria-hidden>{marca.emoji}</span>}
      {marca.nome}
    </span>
  );
}
