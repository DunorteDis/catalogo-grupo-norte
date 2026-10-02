"use client";

import { useEffect, useRef } from "react";

/** Passo da grade e lado do quadrado, em px de CSS. */
const PASSO = 22;
const LADO = 11;
/** A grade troca de estado em degraus, sem fade: ~9 vezes por segundo. */
const DEGRAU = 0.11;
/** Rastro do mouse: raio em células, quanto o centro aquece por segundo e em quantos
 * segundos o calor cai a ~37%. */
const RAIO = 5.5;
const AQUECE = 8;
const ESFRIA = 2;

// Matriz de Bayer 4×4: o pontilhado ordenado que faz o degradê de quadrados.
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);

const hash = (x: number, y: number, z = 0) => {
  const s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453;
  return s - Math.floor(s);
};

/** Ruído de valor 2D, suave entre os vértices. */
function ruido(x: number, y: number) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  const a = hash(xi, yi);
  const b = hash(xi + 1, yi);
  const c = hash(xi, yi + 1);
  const d = hash(xi + 1, yi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

/**
 * Nível do quadrado (0 apagado … 4 brilho raro): esparso no alto, cada vez mais denso
 * para baixo, com uma mancha que sobe devagar e um tremor em degraus. `calor` (0–1) é o
 * rastro do mouse, que acende a célula nos tons fortes com o mesmo pontilhado.
 */
function nivel(col: number, lin: number, linhas: number, t: number, calor: number) {
  const bayer = BAYER[(lin % 4) * 4 + (col % 4)]! - 0.5;
  const tremor = hash(col, lin, Math.floor(t / DEGRAU + hash(lin, col) * 3));
  const baixo = Math.pow(lin / Math.max(linhas - 1, 1), 1.8);
  const mancha = ruido(col * 0.16, lin * 0.16 + t * 0.25);
  const x = baixo * 0.78 + (mancha - 0.5) * 0.55 + (tremor - 0.5) * 0.18 + bayer * 0.35;
  // A maior parte fica nos dois tons escuros; o roxo da marca e o lilás são raros.
  const base = x < 0.34 ? 0 : x < 0.62 ? 1 : x < 0.88 ? 2 : x < 0.985 ? 3 : 4;
  if (!calor) return base;
  const h = calor + bayer * 0.4 + (tremor - 0.5) * 0.2;
  return Math.max(base, h < 0.18 ? 0 : h < 0.42 ? 2 : h < 0.72 ? 3 : 4);
}

const rgb = (cor: string) => {
  const h = cor.trim().replace("#", "");
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
};
const misturar = (a: number[], b: number[], t: number) =>
  `rgb(${a.map((v, i) => Math.round(v + (b[i]! - v) * t)).join(",")})`;

/**
 * Campo de quadrados do painel roxo do login, no espírito do omarchy.pt: pontilhado que
 * se adensa para baixo e "ferve" em degraus; o mouse acende os quadrados por onde passa
 * e o rastro apaga devagar. Cores dos tokens do painel; pausa com a aba escondida e fica
 * parado (sem rastro) com "menos movimento" no sistema.
 */
export function FundoPixels({ className }: { className?: string }) {
  const tela = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = tela.current;
    const ctx = canvas?.getContext("2d");
    const area = canvas?.parentElement;
    if (!canvas || !ctx || !area) return;

    // Tons do próprio painel: do fundo ao roxo da marca, e o lilás como brilho raro.
    const tokens = getComputedStyle(document.documentElement);
    const fundo = rgb(tokens.getPropertyValue("--sidebar-bg"));
    const marca = rgb(tokens.getPropertyValue("--primary"));
    const lilas = rgb("#9d78f0");
    const cores = [
      "",
      misturar(fundo, marca, 0.26),
      misturar(fundo, marca, 0.5),
      misturar(fundo, marca, 0.85),
      misturar(marca, lilas, 0.6),
    ];

    let dpr = 1;
    let largura = 0;
    let altura = 0;
    let colunas = 0;
    let linhas = 0;
    let calor = new Float32Array(0);
    const ajustar = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      largura = canvas.clientWidth;
      altura = canvas.clientHeight;
      canvas.width = Math.max(1, Math.round(largura * dpr));
      canvas.height = Math.max(1, Math.round(altura * dpr));
      colunas = Math.ceil(largura / PASSO);
      linhas = Math.ceil(altura / PASSO);
      calor = new Float32Array(colunas * linhas);
    };

    const desenhar = (t: number) => {
      const margem = (PASSO - LADO) / 2;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, largura, altura);
      for (let lin = 0; lin < linhas; lin++) {
        // Grade presa ao rodapé: a última linha fica sempre inteira.
        const y = altura - (linhas - lin) * PASSO + margem;
        for (let col = 0; col < colunas; col++) {
          const n = nivel(col, lin, linhas, t, calor[lin * colunas + col]!);
          if (!n) continue;
          ctx.fillStyle = cores[n]!;
          ctx.fillRect(col * PASSO + margem, y, LADO, LADO);
        }
      }
    };

    // Posição do mouse no canvas; null fora do painel.
    let ponteiro: { x: number; y: number } | null = null;
    let quente = false;
    /** Esfria o campo inteiro e aquece um disco em volta do mouse: parado, acende mais. */
    const aquecer = (dt: number) => {
      quente = false;
      const queda = Math.exp(-dt / ESFRIA);
      for (let i = 0; i < calor.length; i++) {
        calor[i] = calor[i]! > 0.02 ? calor[i]! * queda : 0;
        if (calor[i]) quente = true;
      }
      if (!ponteiro) return;
      // Célula (fracionária) sob o mouse, na mesma grade presa ao rodapé.
      const cp = ponteiro.x / PASSO - 0.5;
      const lp = linhas - (altura - ponteiro.y) / PASSO - 0.5;
      const l1 = Math.min(linhas - 1, Math.ceil(lp + RAIO));
      const c1 = Math.min(colunas - 1, Math.ceil(cp + RAIO));
      for (let lin = Math.max(0, Math.floor(lp - RAIO)); lin <= l1; lin++) {
        for (let col = Math.max(0, Math.floor(cp - RAIO)); col <= c1; col++) {
          const d = Math.hypot(col - cp, lin - lp) / RAIO;
          if (d >= 1) continue;
          const i = lin * colunas + col;
          calor[i] = Math.min(1, calor[i]! + (1 - d) * AQUECE * dt);
          quente = true;
        }
      }
    };

    const parado = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let quadro = 0;
    let ultimo = -1;
    let anterior = 0;
    const inicio = performance.now();
    const passo = (agora: number) => {
      const t = (agora - inicio) / 1000;
      const dt = Math.min((agora - anterior) / 1000, 0.1);
      anterior = agora;
      const mexendo = ponteiro !== null || quente;
      if (mexendo) aquecer(dt);
      // Sem mouse, só redesenha quando a grade muda de degrau.
      const degrau = Math.floor(t / DEGRAU);
      if (degrau !== ultimo || mexendo) {
        ultimo = degrau;
        desenhar(degrau * DEGRAU);
      }
      quadro = requestAnimationFrame(passo);
    };
    const rodar = () => {
      cancelAnimationFrame(quadro);
      if (parado) desenhar(0);
      else if (!document.hidden) {
        anterior = performance.now();
        quadro = requestAnimationFrame(passo);
      }
    };

    // O conteúdo do painel fica por cima do canvas: o mouse é lido no painel inteiro.
    const mover = (e: PointerEvent) => {
      const r = canvas.getBoundingClientRect();
      ponteiro = { x: e.clientX - r.left, y: e.clientY - r.top };
    };
    const sair = () => {
      ponteiro = null;
    };
    if (!parado) {
      area.addEventListener("pointermove", mover);
      area.addEventListener("pointerleave", sair);
    }

    const observador = new ResizeObserver(() => {
      ajustar();
      ultimo = -1;
      if (parado) desenhar(0);
    });
    observador.observe(canvas);
    ajustar();
    document.addEventListener("visibilitychange", rodar);
    rodar();

    return () => {
      cancelAnimationFrame(quadro);
      document.removeEventListener("visibilitychange", rodar);
      area.removeEventListener("pointermove", mover);
      area.removeEventListener("pointerleave", sair);
      observador.disconnect();
    };
  }, []);

  return <canvas ref={tela} aria-hidden className={className} />;
}
