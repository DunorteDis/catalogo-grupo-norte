import { numeroNacional } from "@/lib/catalogo";

export type TipoMensagem =
  "texto" | "imagem" | "audio" | "video" | "documento" | "figurinha" | "outro";

/** Mensagem como o CRM guarda, tirada do webhook da W-API. */
export type MensagemWhatsapp = {
  instancia: string;
  waId: string;
  /** DDD + número, sem o 55; null quando o WhatsApp só mandou o LID. */
  telefone: string | null;
  /** Id interno do contato no WhatsApp ("123...@lid"), quando veio. */
  lid: string | null;
  /** waId da mensagem citada, quando é uma resposta (o "responder" do WhatsApp). */
  respondeA: string | null;
  /** Link da foto de perfil do contato (pps.whatsapp.net, vence em ~10 dias), quando veio. */
  foto: string | null;
  /** Nome que o contato usa no WhatsApp; só vale em mensagem recebida. */
  nome: string | null;
  deMim: boolean;
  tipo: TipoMensagem;
  texto: string | null;
  enviadaEm: string;
};

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj | undefined =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as Obj) : undefined;
const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : undefined);

const TIPOS: [string, TipoMensagem][] = [
  ["imageMessage", "imagem"],
  ["audioMessage", "audio"],
  ["videoMessage", "video"],
  ["documentMessage", "documento"],
  ["stickerMessage", "figurinha"],
];

/** Avisos que chegam como mensagem (apagar, editar, reagir...): não são mensagem nova. */
const AVISOS = [
  "protocolMessage",
  "reactionMessage",
  "editedMessage",
  "pollUpdateMessage",
  "keepInChatMessage",
];

/** O conteúdo da mensagem; o documento com legenda vem um nível abaixo e sobe aqui. */
function conteudo(dados: Obj): Obj {
  const m = obj(dados["message"]) ?? obj(dados["msgContent"]) ?? {};
  const doc = obj(obj(m["documentWithCaptionMessage"])?.["message"])?.["documentMessage"];
  return doc ? { ...m, documentMessage: doc } : m;
}

/** O que o download-media da W-API pede para trazer o arquivo de uma mensagem. */
export type ArquivoWhatsapp = {
  type: "image" | "video" | "audio" | "document" | "sticker";
  mediaKey: string;
  directPath: string;
  mimetype: string;
  /** Nome do documento; nas outras mídias, null. */
  nome: string | null;
  /** Em bytes, quando o WhatsApp informa. */
  tamanho: number | null;
};

const ARQUIVOS: [string, ArquivoWhatsapp["type"]][] = [
  ["imageMessage", "image"],
  ["videoMessage", "video"],
  ["audioMessage", "audio"],
  ["documentMessage", "document"],
  ["stickerMessage", "sticker"],
];

/** Dados do arquivo de uma mensagem (o corpo do webhook, como fica em mensagens.bruto). */
export function arquivoDaMensagem(corpo: unknown): ArquivoWhatsapp | null {
  const raiz = obj(corpo);
  if (!raiz) return null;
  const m = conteudo(obj(raiz["data"]) ?? raiz);
  for (const [chave, type] of ARQUIVOS) {
    const a = obj(m[chave]);
    const mediaKey = str(a?.["mediaKey"]);
    const directPath = str(a?.["directPath"]);
    const mimetype = str(a?.["mimetype"]);
    if (a && mediaKey && directPath && mimetype)
      return {
        type,
        mediaKey,
        directPath,
        mimetype,
        nome: str(a["fileName"]) ?? null,
        tamanho: Number(a["fileLength"]) || null,
      };
  }
  return null;
}

/**
 * Lê o corpo que a W-API manda ao webhook de mensagem recebida. Formato documentado:
 * `{ event, instanceId, data: { messageId, phone, pushName, message: { conversation }, type,
 * timestamp, fromMe, isGroup } }`. Grupo e corpo sem mensagem voltam null.
 */
// ponytail: cobre o formato documentado e as chaves usuais do WhatsApp (Baileys); o
// corpo inteiro fica em crm.mensagens.bruto para ajustar aqui sem perder nada.
export function lerWebhook(corpo: unknown): MensagemWhatsapp | null {
  const raiz = obj(corpo);
  if (!raiz) return null;
  const dados = obj(raiz["data"]) ?? raiz;
  if (dados["isGroup"] === true) return null;

  const instancia = str(raiz["instanceId"]) ?? str(dados["instanceId"]);
  const waId = str(dados["messageId"]) ?? str(obj(dados["key"])?.["id"]) ?? str(dados["id"]);
  const deMim = dados["fromMe"] === true;
  const chat = str(obj(dados["chat"])?.["id"]) ?? str(obj(dados["key"])?.["remoteJid"]);
  // Status (o "story" do WhatsApp) chega com chat "status" ou "status@broadcast".
  if (chat === "status" || /@(g\.us|broadcast)$/.test(chat ?? "")) return null;

  // Recebida: o sender é o contato e traz o telefone mesmo quando o chat vem como LID.
  // Enviada pelo celular: o sender sou eu, então só o chat diz quem é o contato.
  const sender = deMim ? undefined : obj(dados["sender"]);
  // O chat é o contato nos dois sentidos; o sender só quando é ele quem escreve.
  const foto =
    [obj(dados["chat"])?.["profilePicture"], sender?.["profilePicture"]]
      .map(str)
      .find((u) => u?.startsWith("https://")) ?? null;
  const lid = [chat, str(sender?.["senderLid"])].find((c) => c?.endsWith("@lid")) ?? null;
  const telefone =
    [str(dados["phone"]), chat, str(sender?.["id"])]
      .filter((c) => c && !c.endsWith("@lid") && c !== lid?.split("@")[0])
      .map((c) => numeroNacional(c!.split("@")[0]!))
      .find(Boolean) ?? null;
  if (!instancia || !waId || (!telefone && !lid)) return null;

  const m = conteudo(dados);
  if (AVISOS.some((chave) => m[chave])) return null;
  const legenda = (chave: string) => str(obj(m[chave])?.["caption"]);
  const texto =
    (typeof dados["message"] === "string" ? str(dados["message"]) : undefined) ??
    str(m["conversation"]) ??
    str(obj(m["extendedTextMessage"])?.["text"]) ??
    legenda("imageMessage") ??
    legenda("videoMessage") ??
    legenda("documentMessage") ??
    str(obj(m["documentMessage"])?.["fileName"]) ??
    str(dados["text"]) ??
    null;
  const tipo = TIPOS.find(([chave]) => m[chave])?.[1] ?? (texto ? "texto" : "outro");
  // A citação fica no contextInfo do conteúdo (texto, foto, áudio...); a W-API manda stanzaID.
  const respondeA =
    Object.values(m)
      .map((v) => obj(obj(v)?.["contextInfo"]))
      .map((c) => str(c?.["stanzaID"]) ?? str(c?.["stanzaId"]))
      .find(Boolean) ?? null;

  const bruto = Number(dados["timestamp"] ?? dados["moment"] ?? raiz["timestamp"]);
  const ms =
    Number.isFinite(bruto) && bruto > 0 ? (bruto < 1e12 ? bruto * 1000 : bruto) : Date.now();

  return {
    instancia,
    waId,
    telefone,
    lid,
    respondeA,
    foto,
    nome: deMim
      ? null
      : (str(dados["pushName"]) ?? str(sender?.["pushName"]) ?? str(dados["senderName"]) ?? null),
    deMim,
    tipo,
    texto,
    enviadaEm: new Date(ms).toISOString(),
  };
}

/**
 * DDD + 8 últimos dígitos: o WhatsApp manda alguns celulares sem o 9 da frente
 * (5592 8121-9124) e o cadastro tem com o 9 (92 98121-9124). Com a chave os dois batem.
 */
/**
 * Aviso de que o número conectou ou caiu (webhooks de conexão/desconexão da W-API).
 * ponytail: casa pelo nome do evento ("...Connected"/"...Disconnected", no padrão do
 * webhookReceived); o formato exato só se vê na primeira queda.
 */
export function lerConexao(corpo: unknown) {
  const raiz = obj(corpo);
  const instancia = str(raiz?.["instanceId"]) ?? str(obj(raiz?.["data"])?.["instanceId"]);
  const evento = str(raiz?.["event"])?.toLowerCase() ?? "";
  if (!instancia || !evento.includes("connect")) return null;
  return { instancia, conectado: !evento.includes("disconnect") };
}

/** Quando o link da foto do WhatsApp vence (ms): o parâmetro oe, em segundos e em hexa. */
export function fotoVence(url: string) {
  const oe = url.match(/[?&]oe=([0-9a-f]+)/i)?.[1];
  return oe ? parseInt(oe, 16) * 1000 : null;
}

export function chaveTelefone(telefone: string) {
  const n = numeroNacional(telefone);
  return n ? `${n.slice(0, 2)}${n.slice(-8)}` : null;
}

/** "Pedido #A1B2C3D4": os 8 primeiros caracteres do id, que vão na mensagem do catálogo. */
export function codigoPedido(id: string) {
  return id.replace(/-/g, "").slice(0, 8).toUpperCase();
}

/** O código do pedido que o catálogo pôs na mensagem, se houver. */
export function codigoNaMensagem(texto: string | null) {
  return texto?.match(/pedido\s*#([0-9a-f]{8})\b/i)?.[1]?.toUpperCase() ?? null;
}

/** Texto curto da última mensagem para a lista de conversas. */
export function resumoMensagem(m: Pick<MensagemWhatsapp, "tipo" | "texto">) {
  const rotulo: Partial<Record<TipoMensagem, string>> = {
    imagem: "📷 Foto",
    audio: "🎤 Áudio",
    video: "🎥 Vídeo",
    documento: "📄 Documento",
    figurinha: "Figurinha",
    outro: "Mensagem",
  };
  const texto = m.texto?.replace(/\s+/g, " ").trim();
  if (m.tipo === "texto") return texto ?? "";
  return texto ? `${rotulo[m.tipo]} · ${texto}` : (rotulo[m.tipo] ?? "Mensagem");
}
