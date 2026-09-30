/**
 * Copia texto para a área de transferência. Devolve se deu certo.
 *
 * navigator.clipboard só existe em contexto seguro (HTTPS ou localhost). Servido
 * por http://IP, como no servidor interno, ele é undefined e a cópia quebrava
 * calada. Aí cai no caminho antigo: seleciona um textarea invisível e dispara o
 * "copiar" do navegador, que ainda funciona em HTTP.
 */
export async function copiarTexto(texto: string) {
  if (window.isSecureContext && navigator.clipboard) {
    try {
      await navigator.clipboard.writeText(texto);
      return true;
    } catch {
      // Permissão negada ou aba sem foco: tenta o caminho antigo.
    }
  }

  const campo = document.createElement("textarea");
  campo.value = texto;
  campo.setAttribute("readonly", "");
  campo.style.position = "fixed";
  campo.style.top = "0";
  campo.style.opacity = "0";
  // Dentro do diálogo aberto, se houver: o Radix prende o foco nele e tiraria a
  // seleção de um campo fora dele antes do "copiar".
  const onde = document.activeElement?.closest("[role=dialog]") ?? document.body;
  onde.appendChild(campo);
  campo.focus();
  campo.select();
  campo.setSelectionRange(0, texto.length); // iOS ignora o select() sozinho
  try {
    return document.execCommand("copy");
  } catch {
    return false;
  } finally {
    campo.remove();
  }
}
