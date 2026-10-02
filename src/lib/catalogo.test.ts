// Roda com: bun test
import { expect, test } from "bun:test";

import {
  CHAVE_FOTO,
  formatarDocumento,
  formatarTelefone,
  paginaValida,
  fotoUrl,
  montarMensagem,
  numeroNacional,
  palavrasBusca,
  parseCodigos,
  qtdComUnidade,
  slugify,
  umCadastroPorCodigo,
} from "./catalogo";

test("paginaValida traz a página de volta quando a lista encolhe", () => {
  expect(paginaValida(2, 177)).toBe(2);
  expect(paginaValida(17, 177)).toBe(17);
  expect(paginaValida(18, 177)).toBe(17); // 177 registros = páginas 0 a 17
  expect(paginaValida(5, 12)).toBe(1);
  expect(paginaValida(3, 0)).toBe(0);
});

test("formatarDocumento mascara CNPJ e CPF e devolve o resto como veio", () => {
  expect(formatarDocumento("04252011000110")).toBe("04.252.011/0001-10");
  expect(formatarDocumento("12345678901")).toBe("123.456.789-01");
  expect(formatarDocumento("123")).toBe("123");
});

test("fotoUrl completa o nome de arquivo do ERP e respeita link colado", () => {
  expect(fotoUrl("7891234567890.jpeg")).toBe(
    "https://api.vmaissistemas.com.br/foto_produtos/7891234567890.jpeg",
  );
  expect(fotoUrl("https://cdn.exemplo.com/foto.png")).toBe("https://cdn.exemplo.com/foto.png");
  expect(fotoUrl("  http://exemplo.com/a.jpg  ")).toBe("http://exemplo.com/a.jpg");
  expect(fotoUrl(null)).toBeNull();
  expect(fotoUrl("   ")).toBeNull();
});

test("fotoUrl deixa o caminho /fotos do S3 para o app assinar", () => {
  const chave = "3f1c2a9e-0b7d-4c1e-9a2f-6d5e4b3a2c1d.jpg";
  expect(fotoUrl(`/fotos/${chave}`)).toBe(`/fotos/${chave}`);
  expect(CHAVE_FOTO.test(chave)).toBe(true);
  // /fotos só assina foto enviada pelo app, nunca outro caminho do bucket.
  expect(CHAVE_FOTO.test("../segredo.jpg")).toBe(false);
  expect(CHAVE_FOTO.test(`outra-pasta/${chave}`)).toBe(false);
  expect(CHAVE_FOTO.test(chave.replace(".jpg", ".svg"))).toBe(false);
});

test("parseCodigos aceita qualquer separador de planilha ou lista", () => {
  expect(parseCodigos("7891234567890\n7891234567891")).toEqual(["7891234567890", "7891234567891"]);
  expect(parseCodigos("7891234567890; 7891234567891,7891234567892")).toEqual([
    "7891234567890",
    "7891234567891",
    "7891234567892",
  ]);
  // Copiar e colar de planilha vem com tab e aspas grudadas no código
  expect(parseCodigos('"7891234567890"\t"7891234567891"')).toEqual([
    "7891234567890",
    "7891234567891",
  ]);
});

test("parseCodigos tira repetidos mantendo a ordem da lista", () => {
  expect(parseCodigos("A1\nB2\nA1\nC3\nB2")).toEqual(["A1", "B2", "C3"]);
});

test("parseCodigos preserva código com letra, ponto ou hífen", () => {
  expect(parseCodigos("ABC-123\n45.678\nx_9")).toEqual(["ABC-123", "45.678", "x_9"]);
});

test("parseCodigos devolve vazio para texto sem código", () => {
  expect(parseCodigos("")).toEqual([]);
  expect(parseCodigos("   \n\n , ; \t ")).toEqual([]);
});

test("palavrasBusca cobra uma palavra de cada vez, em qualquer ordem", () => {
  // Sem isso, "gillette carvao" não acha "AP BARB GILLETTE PRESTO3 CARVAO ATV".
  expect(palavrasBusca("gillette carvao")).toEqual(["gillette", "carvao"]);
});

test("palavrasBusca tira acento, porque o cadastro vem sem", () => {
  expect(palavrasBusca("carvão")).toEqual(["carvao"]);
});

test("palavrasBusca só deixa passar letra e número", () => {
  // % e _ são curinga do ILIKE; aspas e traços não têm o que fazer numa busca.
  expect(palavrasBusca("gillette, carvao (novo)")).toEqual(["gillette", "carvao", "novo"]);
  expect(palavrasBusca("100%*")).toEqual(["100"]);
  expect(palavrasBusca("a_b' or 1=1 --")).toEqual(["a", "b", "or", "1"]);
});

test("palavrasBusca ignora repetição, espaço sobrando e excesso de palavras", () => {
  expect(palavrasBusca("  sabao   sabao ")).toEqual(["sabao"]);
  expect(palavrasBusca("a b c d e f g h")).toHaveLength(6);
  expect(palavrasBusca("")).toEqual([]);
  expect(palavrasBusca("   ")).toEqual([]);
});

test("umCadastroPorCodigo prefere a linha que já está no catálogo, senão a primeira", () => {
  // Mesmo EAN em duas linhas do ERP: a que já está no catálogo ganha mesmo vindo
  // depois — colar de novo não pode pôr um segundo card do mesmo produto.
  const { achados, repetidos } = umCadastroPorCodigo([
    { id: "antiga", codigo: "789", noCatalogo: false },
    { id: "ligada", codigo: "789", noCatalogo: true },
    { id: "unica", codigo: "123", noCatalogo: false },
    { id: "primeira", codigo: "456", noCatalogo: false },
    { id: "segunda", codigo: "456", noCatalogo: false },
  ]);
  expect(Object.fromEntries(achados)).toEqual({
    "789": "ligada",
    "123": "unica",
    "456": "primeira",
  });
  expect(repetidos).toBe(2);
});

test("slugify gera o pedaço do link do catálogo", () => {
  expect(slugify("Promoção de Páscoa 2026")).toBe("promocao-de-pascoa-2026");
  expect(slugify("  Mix da Semana  ")).toBe("mix-da-semana");
});

test("qtdComUnidade concorda o plural e não esconde unidade desconhecida", () => {
  expect(qtdComUnidade(1, "CX")).toBe("1 caixa");
  expect(qtdComUnidade(12, "CX")).toBe("12 caixas");
  expect(qtdComUnidade(1, "UN")).toBe("1 unidade");
  expect(qtdComUnidade(3, "KG")).toBe("3 KG");
});

test("montarMensagem leva a unidade de cada item e totaliza por unidade", () => {
  const item = { produto_id: "p", arquivo: null };
  const texto = montarMensagem({
    distribuidora: "Dunorte",
    itens: [
      { ...item, codigo: "789", nome: "SABAO EM PO", quantidade: 5, unidade: "CX" },
      { ...item, codigo: "123", nome: "DETERGENTE", quantidade: 3, unidade: "UN" },
      { ...item, codigo: "456", nome: "AMACIANTE", quantidade: 2, unidade: "CX" },
    ],
  });
  expect(texto.startsWith("*Novo pedido - Dunorte*")).toBe(true);
  expect(montarMensagem({ distribuidora: "Dunorte", codigo: "A1B2C3D4", itens: [] })).toContain(
    "*Novo pedido #A1B2C3D4 - Dunorte*",
  );
  expect(texto).toContain("Cód: 789 — Qtd: 5 caixas");
  expect(texto).toContain("Cód: 123 — Qtd: 3 unidades");
  // Caixa não se soma com unidade: 3 unidades e 7 caixas, nunca "10 itens".
  expect(texto).toContain("Total: 3 unidades e 7 caixas");
});

test("numeroNacional deixa DDD + número, do jeito que o ERP e o WhatsApp mandarem", () => {
  expect(numeroNacional("92 99217-7381")).toBe("92992177381");
  expect(numeroNacional("+55 (92) 99217-7381")).toBe("92992177381");
  expect(numeroNacional("5592992177381")).toBe("92992177381");
  expect(numeroNacional("092 3639-8889")).toBe("9236398889");
  // Sem DDD não identifica ninguém.
  expect(numeroNacional("99217-7381")).toBeNull();
  expect(numeroNacional("")).toBeNull();
  expect(formatarTelefone("92992177381")).toBe("(92) 99217-7381");
  expect(formatarTelefone("9236398889")).toBe("(92) 3639-8889");
  expect(formatarTelefone("ramal 12")).toBe("ramal 12");
});
