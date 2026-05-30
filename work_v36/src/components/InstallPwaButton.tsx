import { useEffect, useMemo, useState } from "react";
import { Download, Smartphone } from "lucide-react";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

function isIOSDevice() {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent.toLowerCase();
  return /iphone|ipad|ipod/.test(ua);
}

function installationHint() {
  if (typeof window === "undefined") return "Ava see leht telefonis või arvutis, et rakendust lisada.";
  if (!window.isSecureContext && window.location.hostname !== "localhost") {
    return "Installimine töötab tavaliselt ainult HTTPS-iga või localhosti kaudu. IP-aadressiga HTTP-ühendus ei pruugi installi pakkuda.";
  }
  if (isIOSDevice()) {
    return "iPhone'is ava Safari menüü (Share) ja vali Add to Home Screen.";
  }
  return "Kui brauser toetab installi, ilmub allolev nupp või brauseri menüüsse installivõimalus.";
}

export function InstallPwaButton() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [message, setMessage] = useState(installationHint());

  useEffect(() => {
    const onBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setDeferredPrompt(event as BeforeInstallPromptEvent);
      setMessage("Brauser lubab installi. Vajuta nuppu, et lisada rakendus koduekraanile.");
    };

    const onAppInstalled = () => {
      setInstalled(true);
      setDeferredPrompt(null);
      setMessage("Rakendus on installitud.");
    };

    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    window.addEventListener("appinstalled", onAppInstalled);
    setMessage(installationHint());

    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
      window.removeEventListener("appinstalled", onAppInstalled);
    };
  }, []);

  const title = useMemo(() => {
    if (installed) return "Rakendus on installitud";
    if (deferredPrompt) return "Installi rakendus";
    return "Installi rakendus";
  }, [deferredPrompt, installed]);

  const handleInstall = async () => {
    if (installed) return;

    if (deferredPrompt) {
      await deferredPrompt.prompt();
      const choice = await deferredPrompt.userChoice;
      if (choice.outcome === "accepted") {
        setMessage("Rakendus lisati koduekraanile.");
      } else {
        setMessage("Installimine jäi pooleli. Proovi hiljem uuesti või kasuta brauseri menüüd.");
      }
      setDeferredPrompt(null);
      return;
    }

    setMessage(installationHint());
    window.alert(installationHint());
  };

  return (
    <div className="flex flex-col items-start gap-2">
      <button
        type="button"
        onClick={handleInstall}
        disabled={installed}
        className="inline-flex items-center gap-2 rounded-xl border border-primary/30 bg-primary/10 px-4 py-2 text-sm font-medium text-primary transition hover:bg-primary/15 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isIOSDevice() ? <Smartphone className="h-4 w-4" /> : <Download className="h-4 w-4" />}
        {title}
      </button>
      <p className="max-w-sm text-xs leading-5 text-muted-foreground">{message}</p>
    </div>
  );
}
