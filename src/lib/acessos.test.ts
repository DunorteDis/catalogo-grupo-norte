// Roda com: bun test
import { expect, test } from "bun:test";

import {
  ALFABETO_SENHA,
  TAMANHO_SENHA,
  USUARIO_MAX,
  emailDeUsuario,
  gerarSenha,
  loginParaEmail,
  mensagemAcesso,
  normalizarUsuario,
  usuarioDeEmail,
  usuarioDeNome,
  validarUsuario,
  senhaFraca,
} from "./acessos";

test("usuário sai como primeiro.ultimo, sem acento e sem nome do meio", () => {
  expect(usuarioDeNome("Eduardo Oliveira")).toBe("eduardo.oliveira");
  expect(usuarioDeNome("João da Silva Souza")).toBe("joao.souza");
  expect(usuarioDeNome("  Maria   Conceição  ")).toBe("maria.conceicao");
  expect(usuarioDeNome("Madonna")).toBe("madonna");
  expect(usuarioDeNome("José D'Ávila")).toBe("jose.avila");
});

test("nome vazio ou só símbolos não gera usuário quebrado", () => {
  expect(usuarioDeNome("")).toBe("usuario");
  expect(usuarioDeNome("!!! ???")).toBe("usuario");
});

test("normalizar limpa o que foi digitado sem estragar o que já era válido", () => {
  expect(normalizarUsuario("Eduardo Oliveira")).toBe("eduardo.oliveira");
  expect(normalizarUsuario("João  Souza")).toBe("joao.souza");
  expect(normalizarUsuario("ana_paula")).toBe("ana.paula");
  expect(normalizarUsuario("ana..paula")).toBe("ana.paula");
  expect(normalizarUsuario("A@N#A!")).toBe("ana");
  expect(normalizarUsuario("ana.paula")).toBe("ana.paula");
  // digitar o ponto no meio da palavra não pode ser engolido
  expect(normalizarUsuario("ana.")).toBe("ana.");
});

test("validar aceita o formato do login e recusa o resto", () => {
  expect(validarUsuario("ana.paula")).toBeNull();
  expect(validarUsuario("ana")).toBeNull();
  expect(validarUsuario("ana2")).toBeNull();
  expect(validarUsuario("an")).toContain("ao menos");
  expect(validarUsuario("ana.")).toContain("apenas letras");
  expect(validarUsuario(".ana")).toContain("apenas letras");
  expect(validarUsuario("ana..paula")).toContain("apenas letras");
  expect(validarUsuario("a".repeat(USUARIO_MAX + 1))).toContain("passa de");
});

test("o que normalizar devolve entra no login sem surpresa", () => {
  const digitado = normalizarUsuario("José D'Ávila");
  expect(validarUsuario(digitado)).toBeNull();
  expect(loginParaEmail(digitado)).toBe(emailDeUsuario("jose.davila"));
});

test("senha tem o tamanho exigido e nada de caractere ambíguo", () => {
  for (let i = 0; i < 500; i++) {
    const senha = gerarSenha();
    expect(senha).toHaveLength(TAMANHO_SENHA);
    for (const c of senha) expect(ALFABETO_SENHA).toContain(c);
    // 0/O e 1/l/I fora, senão vira chamado de suporte ao ditar no WhatsApp
    expect(senha).not.toMatch(/[0O1lI]/);
    // ao menos uma letra e um dígito, caso o projeto exija letters_digits
    expect(senha).toMatch(/[a-z]/);
    expect(senha).toMatch(/[2-9]/);
  }
});

test("senha não é sempre a mesma nem sempre na mesma ordem", () => {
  const amostras = new Set(Array.from({ length: 200 }, gerarSenha));
  expect(amostras.size).toBeGreaterThan(190);
  // o dígito obrigatório não pode ficar preso numa posição fixa
  const posicoes = new Set(Array.from({ length: 200 }, () => gerarSenha().search(/[2-9]/)));
  expect(posicoes.size).toBeGreaterThan(1);
});

test("login completa o domínio, mas respeita quem já tem e-mail real", () => {
  expect(loginParaEmail("eduardo.oliveira")).toBe(emailDeUsuario("eduardo.oliveira"));
  expect(loginParaEmail("  Eduardo.Oliveira ")).toBe(emailDeUsuario("eduardo.oliveira"));
  // contas antigas foram criadas com e-mail de verdade e não podem ser travadas fora
  expect(loginParaEmail("marcos@dunorte.com.br")).toBe("marcos@dunorte.com.br");
});

test("usuarioDeEmail só tira o domínio interno", () => {
  expect(usuarioDeEmail(emailDeUsuario("ana.paula"))).toBe("ana.paula");
  expect(usuarioDeEmail("marcos@dunorte.com.br")).toBe("marcos@dunorte.com.br");
});

test("mensagem do WhatsApp leva usuário, senha e link", () => {
  const texto = mensagemAcesso({
    nome: "Ana Paula",
    usuario: "ana.paula",
    senha: "7k4m9p",
    url: "https://catalogo.exemplo/auth",
  });
  expect(texto).toContain("Usuário: ana.paula");
  expect(texto).toContain("Senha: 7k4m9p");
  expect(texto).toContain("https://catalogo.exemplo/auth");
});

test("senhaFraca barra o que um ataque testa primeiro", () => {
  // curta demais
  expect(senhaFraca("abc123")).toMatch(/ao menos 8/);
  // clássicos da lista
  expect(senhaFraca("12345678")).toBeTruthy();
  expect(senhaFraca("Senha123")).toBeTruthy();
  expect(senhaFraca("gruponorte1")).toBeTruthy();
  // pouca variedade e sequências
  expect(senhaFraca("aaaaaaaa")).toBeTruthy();
  expect(senhaFraca("abcdefgh")).toBeTruthy();
  expect(senhaFraca("87654321")).toBeTruthy();
  // o próprio usuário dentro da senha
  expect(senhaFraca("ana.paula2026", "ana.paula")).toMatch(/nome de usuário/);
  // senha comum e razoável passa
  expect(senhaFraca("Jacare#Roxo7", "ana.paula")).toBeNull();
  expect(senhaFraca("mudei2026aq", "ana.paula")).toBeNull();
});
