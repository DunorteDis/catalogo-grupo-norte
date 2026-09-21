import dunorte from "@/assets/logos/dunorte.png";
import elonorte from "@/assets/logos/elonorte.png";
import metanorte from "@/assets/logos/metanorte.png";
import mixnorte from "@/assets/logos/mixnorte.png";
import rotanorte from "@/assets/logos/rotanorte.png";
import supergiro from "@/assets/logos/supergiro.png";

// ponytail: logo por slug, resolvida em build. A coluna distribuidoras.logo_url
// apontava para assets internos do Lovable (/__l5e/...) e nunca foi editavel pelo
// app, entao trocar uma logo sempre exigiu deploy de qualquer forma. Se um dia a
// logo virar conteudo que o admin edita, ai sim volta pro banco + Supabase Storage.
export const LOGOS: Record<string, string | undefined> = {
  dunorte,
  elonorte,
  metanorte,
  mixnorte,
  rotanorte,
  supergiro,
};
