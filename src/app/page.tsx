import { redirect } from "next/navigation";

// O sistema começa no login. O catálogo público continua em /c/[slug]/[distribuidora].
export default function Inicio() {
  redirect("/auth");
}
