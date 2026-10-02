// Roda com: bun test
import { expect, test } from "bun:test";

import {
  arquivoDaMensagem,
  chaveTelefone,
  codigoNaMensagem,
  codigoPedido,
  fotoVence,
  lerConexao,
  lerWebhook,
  resumoMensagem,
} from "./whatsapp";

const documentado = {
  event: "message.received",
  instanceId: "T34398-VYR3QD-MS29SL",
  data: {
    messageId: "ABC123XYZ",
    phone: "5592981219124",
    pushName: "Nome do Contato",
    message: { conversation: "Texto da mensagem" },
    type: "text",
    timestamp: 1710000000,
    fromMe: false,
    isGroup: false,
  },
};

test("lerWebhook entende o formato documentado da W-API", () => {
  expect(lerWebhook(documentado)).toEqual({
    instancia: "T34398-VYR3QD-MS29SL",
    waId: "ABC123XYZ",
    telefone: "92981219124",
    lid: null,
    respondeA: null,
    foto: null,
    nome: "Nome do Contato",
    deMim: false,
    tipo: "texto",
    texto: "Texto da mensagem",
    enviadaEm: new Date(1710000000 * 1000).toISOString(),
  });
});

test("lerWebhook: foto com legenda, mensagem minha e grupo", () => {
  const foto = lerWebhook({
    ...documentado,
    data: { ...documentado.data, message: { imageMessage: { caption: "esse aqui" } } },
  });
  expect(foto?.tipo).toBe("imagem");
  expect(foto?.texto).toBe("esse aqui");

  const minha = lerWebhook({ ...documentado, data: { ...documentado.data, fromMe: true } });
  expect(minha?.deMim).toBe(true);
  expect(minha?.nome).toBeNull(); // pushName de mensagem minha é o meu nome, não o do contato

  expect(lerWebhook({ ...documentado, data: { ...documentado.data, isGroup: true } })).toBeNull();
  expect(lerWebhook({ event: "connected" })).toBeNull();
});

// Forma que a W-API manda de verdade (out/2026): campos soltos, sem o "data" da documentação.
const real = {
  event: "webhookReceived",
  instanceId: "LITE-CX55I4-KAA9NX",
  messageId: "AC1EC70E4958C4A343905BB5C4B66718",
  fromMe: false,
  isGroup: false,
  moment: 1790878665,
  chat: { id: "5592981219124", profilePicture: null },
  sender: { id: "5592981219124", pushName: "Cliente Teste", senderLid: "123456789012345@lid" },
  msgContent: { conversation: "bom dia" },
};

test("lerWebhook entende o formato real da W-API e ignora status", () => {
  expect(lerWebhook(real)).toMatchObject({
    instancia: "LITE-CX55I4-KAA9NX",
    telefone: "92981219124",
    nome: "Cliente Teste",
    tipo: "texto",
    texto: "bom dia",
    enviadaEm: new Date(1790878665 * 1000).toISOString(),
  });
  // Contato com LID: o chat vem como LID e o telefone só no sender (sem o 9 da frente).
  const comLid = {
    ...real,
    chat: { id: "123456789012345@lid" },
    sender: { id: "559281219124", pushName: "Cliente", senderLid: "123456789012345@lid" },
  };
  expect(lerWebhook(comLid)).toMatchObject({
    telefone: "9281219124",
    lid: "123456789012345@lid",
  });
  // Enviada pelo celular para esse contato: o sender sou eu, só sobra o LID.
  const minhaParaLid = {
    ...comLid,
    event: "webhookDelivery",
    fromMe: true,
    sender: { id: "559281219124" },
  };
  expect(lerWebhook(minhaParaLid)).toMatchObject({
    telefone: null,
    lid: "123456789012345@lid",
    deMim: true,
    nome: null,
  });
  // Status (o "story" do WhatsApp) chega com chat "status"; não é conversa.
  const status = { ...real, chat: { id: "status" }, msgContent: { imageMessage: {} } };
  expect(lerWebhook(status)).toBeNull();
  expect(lerWebhook({ ...real, chat: { id: "sem-numero" }, sender: {} })).toBeNull();
});

test("arquivoDaMensagem tira o que o download-media pede", () => {
  const foto = {
    ...real,
    msgContent: {
      imageMessage: {
        mediaKey: "k",
        directPath: "/p",
        mimetype: "image/jpeg",
        fileLength: "1234",
        caption: "esse",
      },
    },
  };
  expect(arquivoDaMensagem(foto)).toEqual({
    type: "image",
    mediaKey: "k",
    directPath: "/p",
    mimetype: "image/jpeg",
    nome: null,
    tamanho: 1234,
  });
  // Documento com legenda vem um nível abaixo.
  const pdf = {
    ...real,
    msgContent: {
      documentWithCaptionMessage: {
        message: {
          documentMessage: {
            mediaKey: "k",
            directPath: "/p",
            mimetype: "application/pdf",
            fileName: "cotacao.pdf",
            caption: "segue",
          },
        },
      },
    },
  };
  expect(arquivoDaMensagem(pdf)).toMatchObject({ type: "document", nome: "cotacao.pdf" });
  expect(lerWebhook(pdf)).toMatchObject({ tipo: "documento", texto: "segue" });
  expect(arquivoDaMensagem(real)).toBeNull();
  // Resposta citando outra mensagem (o "responder" do WhatsApp): stanzaID com "ID" maiúsculo.
  const resposta = {
    ...real,
    msgContent: {
      extendedTextMessage: { text: "sim", contextInfo: { stanzaID: "3EB088E6593F" } },
    },
  };
  expect(lerWebhook(resposta)).toMatchObject({ texto: "sim", respondeA: "3EB088E6593F" });
  expect(lerWebhook(real)?.respondeA).toBeNull();
  // Apagar ou editar mensagem chega como protocolMessage: não é mensagem nova.
  expect(lerWebhook({ ...real, msgContent: { protocolMessage: { type: 0 } } })).toBeNull();
});

test("foto do contato vem do chat e vence pelo parâmetro oe", () => {
  const link = "https://pps.whatsapp.net/v/t61/x_n.jpg?ccb=11-4&oh=01_Q5&oe=6ACBADD5&_nc_cat=109";
  const comFoto = { ...real, chat: { id: "5592981219124", profilePicture: link } };
  expect(lerWebhook(comFoto)?.foto).toBe(link);
  // Enviada pelo celular: o sender sou eu, a foto dele não é a do contato.
  const minha = { ...real, fromMe: true, sender: { id: "1", profilePicture: link } };
  expect(lerWebhook(minha)?.foto).toBeNull();
  expect(fotoVence(link)).toBe(0x6acbadd5 * 1000);
  expect(fotoVence("https://exemplo.com/foto.jpg")).toBeNull();
});

test("lerConexao reconhece os avisos de conexão e desconexão", () => {
  const instanceId = "LITE-CX55I4-KAA9NX";
  expect(lerConexao({ event: "webhookDisconnected", instanceId })).toEqual({
    instancia: instanceId,
    conectado: false,
  });
  expect(lerConexao({ event: "webhookConnected", instanceId })).toEqual({
    instancia: instanceId,
    conectado: true,
  });
  // Mensagem traz connectedPhone, mas não é aviso de conexão.
  expect(lerConexao(real)).toBeNull();
});

test("chaveTelefone casa celular com e sem o 9 da frente", () => {
  expect(chaveTelefone("92981219124")).toBe("9281219124");
  expect(chaveTelefone("559281219124")).toBe("9281219124");
  expect(chaveTelefone("(92) 98121-9124")).toBe("9281219124");
  expect(chaveTelefone("123")).toBeNull();
});

test("código do pedido vai e volta pela mensagem", () => {
  const codigo = codigoPedido("a1b2c3d4-e5f6-7890-abcd-ef0123456789");
  expect(codigo).toBe("A1B2C3D4");
  expect(codigoNaMensagem(`*Novo pedido #${codigo} - Dunorte*\n1. SABAO`)).toBe("A1B2C3D4");
  expect(codigoNaMensagem("quero 3 caixas de sabão")).toBeNull();
});

test("resumoMensagem mostra o tipo quando não é texto", () => {
  expect(resumoMensagem({ tipo: "texto", texto: "oi\n tudo bem" })).toBe("oi tudo bem");
  expect(resumoMensagem({ tipo: "audio", texto: null })).toBe("🎤 Áudio");
  expect(resumoMensagem({ tipo: "imagem", texto: "esse" })).toBe("📷 Foto · esse");
});
