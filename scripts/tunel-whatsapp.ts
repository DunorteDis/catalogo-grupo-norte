// Túnel de dev para o WhatsApp: abre um https://….trycloudflare.com para o localhost
// e aponta para ele o recebimento de mensagens das instâncias pedidas. O endereço muda
// a cada vez, por isso o script reaponta sozinho. Em produção vale o APP_URL.
// Roda com: bun run tunel <instância>...   (sem instância, lista as cadastradas)
//
// O banco é o mesmo da produção: passe só a instância de teste. A que passar aqui
// deixa de entregar mensagens à produção enquanto o túnel estiver apontado para cá.
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { createInterface } from "node:readline";

import { sql } from "@/server/db";
import { apontarWebhooks } from "@/server/whatsapp";

const PORTA = 8080;

const pedidas = process.argv.slice(2);
const numeros = await sql<{ instancia: string; token: string; vendedor: string }[]>`
  select n.instancia, n.token, v.nome as vendedor
    from whatsapp_numeros n join vendedores v on v.id = n.vendedor_id
   order by v.nome`;
await sql.end();

const alvos = numeros.filter((n) => pedidas.includes(n.instancia));
if (alvos.length === 0) {
  console.log("Uso: bun run tunel <instância>...\n\nInstâncias cadastradas:");
  for (const n of numeros) console.log(`  ${n.instancia}  ${n.vendedor}`);
  process.exit(1);
}
const chave = process.env["WAPI_WEBHOOK_CHAVE"];
if (!chave) throw new Error("Falta WAPI_WEBHOOK_CHAVE no .env.");

// O instalador (winget) põe no PATH, mas terminal aberto antes da instalação não enxerga.
const WINGET = "C:\\Program Files (x86)\\cloudflared\\cloudflared.exe";
const tunel = spawn(
  existsSync(WINGET) ? WINGET : "cloudflared",
  ["tunnel", "--no-autoupdate", "--url", `http://localhost:${PORTA}`],
  { stdio: ["ignore", "inherit", "pipe"] },
);

// O cloudflared escreve o endereço no stderr. Continua lendo depois de achar: parar
// de ler entupiria o cano e travaria o túnel.
const base = await new Promise<string>((resolve, reject) => {
  createInterface({ input: tunel.stderr! }).on("line", (linha) => {
    if (/\bERR\b/.test(linha)) console.error(linha);
    const url = linha.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/)?.[0];
    if (url) resolve(url);
  });
  tunel.on("error", reject);
  tunel.on("exit", () => reject(new Error("O cloudflared fechou antes de abrir o túnel.")));
});
for (const n of alvos) {
  try {
    await apontarWebhooks(n, `${base}/api/whatsapp?chave=${chave}`);
    console.log(`${n.instancia} (${n.vendedor}) recebendo em ${base}`);
  } catch (e) {
    console.error(`${n.instancia} (${n.vendedor}) não aceitou o endereço: ${(e as Error).message}`);
  }
}
console.log("\nTúnel aberto; Ctrl+C fecha. Fechado, as mensagens param até abrir de novo.");
await new Promise((fim) => tunel.on("exit", fim));
