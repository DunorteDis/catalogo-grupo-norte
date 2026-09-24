import { NextResponse, type NextRequest } from "next/server";

import { COOKIE_SESSAO, lerToken } from "@/lib/sessao-token";

// Conforto de navegação, inclusive quando a sessão vence com a tela aberta.
// A trava de verdade é o exigirLogin/exigirAdmin de cada action.
export async function proxy(request: NextRequest) {
  const sessao = await lerToken(request.cookies.get(COOKIE_SESSAO)?.value);
  if (!sessao) return NextResponse.redirect(new URL("/auth", request.url));
  if (sessao.prov && request.nextUrl.pathname !== "/definir-senha")
    return NextResponse.redirect(new URL("/definir-senha", request.url));
  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*", "/vendedor/:path*", "/meus-pedidos/:path*", "/definir-senha"],
};
