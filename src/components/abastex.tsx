/**
 * Componentes do design system Abastex (classes ax-* em src/abastex.css),
 * portados de components/bundle.js do pacote. Botão e switch são os do
 * shadcn já no visual do DS (src/components/ui).
 */
import { Fragment, type CSSProperties, type InputHTMLAttributes, type ReactNode } from "react";
import { ArrowDownRight, ArrowRight, ArrowUpRight, Search, type LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";
import { Switch } from "@/components/ui/switch";

/** Cada módulo tem um tom: Visão geral brand · Distribuidoras info · Produtos warning · Catálogos rose · Pedidos accent · Usuários brand. */
export type Tom = "brand" | "accent" | "warning" | "info" | "rose" | "danger";

export function IconTile({
  icon: Icone,
  tone = "brand",
  size = "md",
  className,
}: {
  icon: LucideIcon;
  tone?: Tom;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  return (
    <span className={cn("ax-tile", `ax-tile--${tone}`, `ax-tile--${size}`, className)}>
      <Icone size={size === "sm" ? 16 : size === "lg" ? 24 : 20} aria-hidden />
    </span>
  );
}

export function PageHeader({
  crumbs,
  icon,
  tone = "brand",
  title,
  subtitle,
  actions,
}: {
  crumbs?: string[];
  icon?: LucideIcon;
  tone?: Tom;
  title: string;
  subtitle?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="ax-page">
      {icon && <IconTile icon={icon} tone={tone} size="lg" />}
      <div className="ax-page__text">
        {crumbs && (
          <nav className="ax-page__crumbs" aria-label="Você está em">
            {crumbs.map((c, i) => (
              <Fragment key={i}>
                {i > 0 && <span aria-hidden>/</span>}
                <span className={i === crumbs.length - 1 ? "is-current" : undefined}>{c}</span>
              </Fragment>
            ))}
          </nav>
        )}
        <h1 className="ax-page__title">{title}</h1>
        {subtitle && <p className="ax-page__sub">{subtitle}</p>}
      </div>
      {actions && <div className="ax-page__actions">{actions}</div>}
    </header>
  );
}

export function Card({
  title,
  subtitle,
  actions,
  children,
  className,
  style,
}: {
  title?: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <section className={cn("ax-card", className)} style={style}>
      {(title || actions) && (
        <header className="ax-card__head">
          <div>
            {title && <h2 className="ax-card__title">{title}</h2>}
            {subtitle && <p className="ax-card__sub">{subtitle}</p>}
          </div>
          {actions && <div className="ax-card__actions">{actions}</div>}
        </header>
      )}
      {children}
    </section>
  );
}

export function KpiCard({
  label,
  value,
  suffix,
  icon,
  tone = "brand",
  delta,
}: {
  label: string;
  value: ReactNode;
  suffix?: string;
  icon?: LucideIcon;
  tone?: Tom;
  delta?: { direction?: "up" | "down" | "flat"; text: string };
}) {
  const Seta =
    delta?.direction === "up"
      ? ArrowUpRight
      : delta?.direction === "down"
        ? ArrowDownRight
        : ArrowRight;
  return (
    <section className="ax-kpi">
      <div className="ax-kpi__top">
        <span className="ax-kpi__label">{label}</span>
        {icon && <IconTile icon={icon} tone={tone} size="sm" />}
      </div>
      <div className="ax-kpi__value">
        {value}
        {suffix && <small> {suffix}</small>}
      </div>
      {delta && (
        <div className={cn("ax-kpi__delta", `is-${delta.direction ?? "flat"}`)}>
          <Seta size={14} aria-hidden />
          {delta.text}
        </div>
      )}
    </section>
  );
}

type TomBadge = "neutral" | "brand" | "accent" | "success" | "warning" | "danger" | "info";

/** Status sempre com palavra, e ícone ou ponto — nunca só a cor. */
export function Badge({
  tone = "neutral",
  solid,
  icon: Icone,
  dot,
  children,
  className,
}: {
  tone?: TomBadge;
  solid?: boolean;
  icon?: LucideIcon;
  dot?: boolean;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <span className={cn("ax-badge", `ax-badge--${tone}`, solid && "ax-badge--solid", className)}>
      {Icone ? <Icone size={14} aria-hidden /> : dot ? <i className="ax-badge__dot" /> : null}
      {children}
    </span>
  );
}

/** Pílula clicável: uma pessoa para agir, ou um link de catálogo para copiar. Sem onClick vira só etiqueta. */
export function Chip({
  tone = "neutral",
  icon: Icone,
  color,
  title,
  onClick,
  children,
  className,
}: {
  tone?: "neutral" | "warning" | "brand";
  icon?: LucideIcon;
  color?: string | undefined;
  title?: string;
  onClick?: () => void;
  children?: ReactNode;
  className?: string;
}) {
  const conteudo = (
    <>
      {Icone && <Icone size={16} aria-hidden />}
      {color && <i className="ax-chip__swatch" style={{ background: color }} />}
      <span>{children}</span>
    </>
  );
  const classe = cn("ax-chip", `ax-chip--${tone}`, className);
  return onClick ? (
    <button type="button" className={classe} onClick={onClick} title={title}>
      {conteudo}
    </button>
  ) : (
    <span className={classe} title={title}>
      {conteudo}
    </span>
  );
}

export type OpcaoAba<T extends string> = { value: T; label: string; icon?: LucideIcon };

export function FilterTabs<T extends string>({
  options,
  value,
  onChange,
  className,
}: {
  options: OpcaoAba<T>[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
}) {
  return (
    <div className={cn("ax-tabs", className)} role="tablist">
      {options.map(({ value: v, label, icon: Icone }) => (
        <button
          key={v}
          type="button"
          role="tab"
          aria-selected={v === value}
          className={cn("ax-tabs__item", v === value && "is-on")}
          onClick={() => onChange(v)}
        >
          {Icone && <Icone size={16} aria-hidden />}
          {label}
        </button>
      ))}
    </div>
  );
}

export function SearchInput({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className={cn("ax-search", className)}>
      <Search size={18} aria-hidden />
      <input type="search" placeholder="Buscar" {...props} />
    </label>
  );
}

/** Ranking em barras horizontais. Métrica única: todas em chart-1. */
export function BarList({
  data,
  color = "chart-1",
  max,
}: {
  data: { label: string; value: number }[];
  color?: `chart-${1 | 2 | 3 | 4 | 5}`;
  max?: number;
}) {
  const teto = max ?? Math.max(1, ...data.map((r) => r.value));
  return (
    <ol className="ax-bars">
      {data.map((r, i) => (
        <li key={r.label + i} className="ax-bars__row">
          <span className="ax-bars__label" title={r.label}>
            {r.label}
          </span>
          <span className="ax-bars__track">
            <span
              className="ax-bars__fill"
              style={{ width: `${(100 * r.value) / teto}%`, background: `var(--${color})` }}
            />
          </span>
          <span className="ax-bars__value">{r.value}</span>
        </li>
      ))}
    </ol>
  );
}

/** Um registro de lista; envolva as linhas num `div.ax-list`. */
export function ListRow({
  thumb,
  title,
  badge,
  meta,
  actions,
  inactive,
}: {
  thumb?: ReactNode;
  title: ReactNode;
  badge?: ReactNode;
  meta?: ReactNode;
  actions?: ReactNode;
  inactive?: boolean;
}) {
  return (
    <div className={cn("ax-row", inactive && "is-inactive")}>
      {thumb && <span className="ax-row__thumb">{thumb}</span>}
      <div className="ax-row__body">
        <div className="ax-row__title">
          <span>{title}</span>
          {badge}
        </div>
        {meta && <div className="ax-row__meta">{meta}</div>}
      </div>
      {actions && <div className="ax-row__actions">{actions}</div>}
    </div>
  );
}

/** Logo, cor própria e o liga/desliga da distribuidora. A cor dela só aparece aqui e em swatches. */
export function DistributorCard({
  name,
  color,
  logo,
  active,
  meta,
  onToggle,
  disabled,
}: {
  name: string;
  color: string;
  logo?: ReactNode;
  active: boolean;
  meta?: string;
  onToggle?: (next: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <article
      className={cn("ax-dist", !active && "is-off")}
      style={{ "--dist": color } as CSSProperties}
    >
      <div className="ax-dist__logo">{logo ?? <span className="ax-dist__name">{name}</span>}</div>
      <footer className="ax-dist__foot">
        <span className="ax-dist__color">
          <i />
          {color}
        </span>
        {meta && <span className="ax-dist__meta">{meta}</span>}
        <label className="inline-flex items-center gap-2 text-[13px] font-semibold">
          {active ? "Ativa" : "Inativa"}
          <Switch
            checked={active}
            onCheckedChange={(v) => onToggle?.(v)}
            disabled={!!disabled}
            aria-label={`${name} ativa`}
          />
        </label>
      </footer>
    </article>
  );
}
