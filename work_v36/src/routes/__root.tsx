import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";
import appCss from "../styles.css?url";

const BASE_URL = import.meta.env.BASE_URL;

function NotFoundComponent() {
  return (
    <main className="min-h-screen flex items-center justify-center p-6">
      <div className="max-w-md rounded-2xl border border-border bg-card/90 p-8 shadow-xl">
        <h1 className="text-3xl font-bold">404</h1>
        <h2 className="mt-2 text-xl font-semibold">Page not found</h2>
        <p className="mt-2 text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <Link
          to="/"
          className="mt-6 inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
        >
          Go home
        </Link>
      </div>
    </main>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();

  return (
    <main className="min-h-screen flex items-center justify-center p-6">
      <div className="max-w-md rounded-2xl border border-border bg-card/90 p-8 shadow-xl">
        <h1 className="text-3xl font-bold">This page didn't load</h1>
        <p className="mt-2 text-muted-foreground">
          Something went wrong on our end. You can try refreshing or head back home.
        </p>

        <div className="mt-6 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Try again
          </button>

          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md border border-border px-4 py-2 text-sm font-medium"
          >
            Go home
          </Link>
        </div>
      </div>
    </main>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { name: "theme-color", content: "#0f172a" },
      { title: "Üraski leviku riskikaart" },
      {
        name: "description",
        content:
          "Eesti kuuse-kooreüraski leviku riskikaart RMK kahjustusalade ja ilmaandmete põhjal.",
      },
      { name: "author", content: "TalTech Edu" },
      { property: "og:title", content: "Üraski leviku riskikaart" },
      {
        property: "og:description",
        content:
          "Eesti kuuse-kooreüraski leviku riskikaart RMK kahjustusalade ja ilmaandmete põhjal.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "twitter:site", content: "@TalTechEdu" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "manifest", href: `${BASE_URL}manifest.webmanifest` },
      { rel: "apple-touch-icon", href: `${BASE_URL}icons/apple-touch-icon.png` },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="et">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();

  // Temporarily disabled while fixing the production styling issue.
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <Outlet />
    </QueryClientProvider>
  );
}