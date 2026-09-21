import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";

// O papel ja vem resolvido pelo shell em _authenticated/route.tsx.
export const Route = createFileRoute("/_authenticated/admin")({
  beforeLoad: ({ context }) => {
    if (!context.admin) throw redirect({ to: "/vendedor" });
  },
  component: () => <Outlet />,
});
