// O Next chama register() uma vez ao subir o servidor, antes de atender requisições.
export async function register() {
  // No build não há banco (a imagem Docker compila sem as variáveis PG*).
  if (
    process.env["NEXT_RUNTIME"] !== "nodejs" ||
    process.env["NEXT_PHASE"] === "phase-production-build"
  )
    return;
  const { migrar } = await import("@/server/migracoes");
  await migrar();
}
