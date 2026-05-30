import { useEffect, useMemo, useState } from "react";
import { Download } from "lucide-react";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

function isStandaloneApp() {
  if (typeof window === "undefined") return false;
  return window.matchMedia?.("(display-mode: standalone)")?.matches || (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
}

function installationHint() {
  return "Kui installidialoog ei avane, kasuta brauseri menüüd: Android Chrome → Add to Home Screen; iPhone Safari → Share → Add to Home Screen.";
}

export function PwaInstallBanner() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [installHint, setInstallHint] = useState(installationHint());

  useEffect(() => {
    setInstalled(isStandaloneApp());

    const onBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setDeferredPrompt(event as BeforeInstallPromptEvent);
      setInstallHint("Brauser lubab installi. Vajuta nuppu, et rakendus telefoni paigaldada.");
    };

    const onAppInstalled = () => {
      setInstalled(true);
      setDeferredPrompt(null);
      setInstallHint("Rakendus on juba installitud või lisatud koduekraanile.");
    };

    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    window.addEventListener("appinstalled", onAppInstalled);

    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
      window.removeEventListener("appinstalled", onAppInstalled);
    };
  }, []);

  const buttonLabel = useMemo(() => {
    if (installed) return "Rakendus on installitud";
    if (deferredPrompt) return "Lae kaart alla";
    return "Lae kaart alla";
  }, [deferredPrompt, installed]);

  const handleInstall = async () => {
    if (installed) return;

    if (!deferredPrompt) {
      window.alert(installationHint());
      setInstallHint(installationHint());
      return;
    }

    await deferredPrompt.prompt();
    const choice = await deferredPrompt.userChoice;
    setDeferredPrompt(null);
    setInstallHint(
      choice.outcome === "accepted"
        ? "Install taotletud. Kui see ei ilmu kohe, kontrolli brauseri installimenüüd."
        : "Install katkestati. Proovi uuesti või kasuta brauseri menüüd."
    );
  };

  return (
    <button
      type="button"
      onClick={handleInstall}
      disabled={installed}
      className="inline-flex items-center justify-center gap-2 rounded-lg border border-primary/30 bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-lg transition-colors hover:bg-primary/90 disabled:cursor-default disabled:opacity-80"
      title={installHint}
    >
      <Download className="h-4 w-4" />
      {buttonLabel}
    </button>
  );
}
