import { createFileRoute, redirect } from "@tanstack/react-router";

// O sistema comeca no login. O catalogo publico continua em /c/$slug/$distribuidora.
export const Route = createFileRoute("/")({
  beforeLoad: () => {
    throw redirect({ to: "/auth" });
  },
});
