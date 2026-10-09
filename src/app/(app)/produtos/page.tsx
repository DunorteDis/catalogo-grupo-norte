import { CadastroDeProdutos } from "@/components/cadastro-produtos";

/** Produtos para o vendedor: só a foto. O admin tem a tela completa em /admin/produtos. */
export default function ProdutosDoVendedorPage() {
  return <CadastroDeProdutos soFoto />;
}
