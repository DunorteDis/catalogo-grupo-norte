import dunorte from "@/assets/logos/dunorte.png";
import elonorte from "@/assets/logos/elonorte.png";
import gruponorte from "@/assets/logos/gruponorte.png";
import metanorte from "@/assets/logos/metanorte.png";
import mixnorte from "@/assets/logos/mixnorte.png";
import rotanorte from "@/assets/logos/rotanorte.png";
import supergiro from "@/assets/logos/supergiro.png";

// ponytail: logo por slug, resolvida em build, das distribuidoras que já existiam
// antes do cadastro pela tela. Distribuidora nova traz o logo no banco
// (distribuidoras.logo_url, /imagens/<id>); quem está aqui tem preferência.
export const LOGOS: Record<string, string | undefined> = {
  dunorte: dunorte.src,
  elonorte: elonorte.src,
  gruponorte: gruponorte.src,
  metanorte: metanorte.src,
  mixnorte: mixnorte.src,
  rotanorte: rotanorte.src,
  supergiro: supergiro.src,
};
