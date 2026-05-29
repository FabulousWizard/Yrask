import { createFileRoute } from "@tanstack/react-router";
import { ClientOnly } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { EstoniaMap, type MapSelection } from "@/components/EstoniaMap";
import { SpruceBackground } from "@/components/SpruceBackground";
import { AREAS, PESTS, WHOLE_ESTONIA } from "@/lib/estonia";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Üraski leviku riskikaart" },
      {
        name: "description",
        content: "Eesti kuuse-kooreüraski leviku riskikaart RMK kahjustusalade ja ilmaandmete põhjal.",
      },
      { property: "og:title", content: "Üraski leviku riskikaart" },
      { property: "og:description", content: "Kaardirakendus, mis arvutab RMK kahjustusala klõpsamisel üraski võimaliku levikusuuna ilmaandmete põhjal." },
    ],
  }),
  component: Index,
});

function formatNumber(value: number | null | undefined, digits = 1, suffix = "") {
  return Number.isFinite(value) ? `${(value as number).toFixed(digits)}${suffix}` : "-";
}

function readableKey(key: string) {
  const labels: Record<string, string> = {
    lnimi: "Liik",
    liik: "Liik",
    vaatlus_kp: "Vaatluse kuupäev",
    vaatluse_kp: "Vaatluse kuupäev",
    maakond: "Maakond",
    area: "Pindala",
    pindala: "Pindala",
    kood: "Kood",
    id: "ID",
    katastri_nr: "Katastritunnus",
    katastritunnus: "Katastritunnus",
    katastri_tunnus: "Katastritunnus",
  };
  return labels[key] ?? key.replaceAll("_", " ");
}

function InfoPanel({ selection, pestName }: { selection: MapSelection | null; pestName: string }) {
  if (!selection) {
    return <p className="text-sm text-muted-foreground">Klõpsa punasel RMK kahjustusalal. Infotabelisse kuvatakse arvutus ainult haige metsa valimisel; tavaline kaardiklõps või maakond infot ei ava.</p>;
  }

  const weather = selection.weather;
  const spread = selection.spread;
  const cadastralText = selection.cadastralIds?.length ? selection.cadastralIds.join(", ") : "andmefailis puudub";
  const properties = Object.entries(selection.properties ?? {}).slice(0, 12);

  return (
    <div className="space-y-4 text-sm">
      <div>
        <div className="text-xs uppercase tracking-wide text-muted-foreground">Valitud objekt</div>
        <div className="text-base font-semibold">{selection.title ?? selection.countyName ?? "Valitud asukoht"}</div>
      </div>

      <dl className="grid gap-2">
        <div className="info-row"><dt>Maakond</dt><dd>{selection.countyName ?? "-"}</dd></div>
        <div className="info-row"><dt>Kahjur</dt><dd>{pestName}</dd></div>
        <div className="info-row"><dt>Koordinaadid</dt><dd>{selection.lat.toFixed(5)}, {selection.lng.toFixed(5)}</dd></div>
        <div className="info-row"><dt>Katastritunnus</dt><dd>{cadastralText}</dd></div>
        <div className="info-row"><dt>Ohuala kuju</dt><dd>{selection.dangerZoneDownwindKm ? "tuule järgi kallutatud ellips" : "-"}</dd></div>
        <div className="info-row"><dt>Ohuala ulatus levikusuunas</dt><dd>{selection.dangerZoneDownwindKm ? `${selection.dangerZoneDownwindKm} km` : "-"}</dd></div>
        <div className="info-row"><dt>Ohuala külgsuunas</dt><dd>{selection.dangerZoneLateralKm ? `${selection.dangerZoneLateralKm} km` : "-"}</dd></div>
        <div className="info-row"><dt>Ohuala vastutuules</dt><dd>{selection.dangerZoneUpwindKm ? `${selection.dangerZoneUpwindKm} km` : "-"}</dd></div>
      </dl>

      {weather ? (
        <div className="rounded-lg border border-border/60 bg-background/35 p-3">
          <h3 className="mb-2 font-semibold">Levikuhinnang valitud haigest metsaalast</h3>
          <dl className="grid gap-2">
            <div className="info-row"><dt>Temperatuur</dt><dd>{formatNumber(weather.temperature, 1, " °C")}</dd></div>
            <div className="info-row"><dt>Tuule kiirus</dt><dd>{formatNumber(weather.windSpeed, 1, " m/s")}</dd></div>
            <div className="info-row"><dt>Tuule suund</dt><dd>{formatNumber(weather.windDirection, 0, "°")}</dd></div>
            <div className="info-row"><dt>Sademed</dt><dd>{formatNumber(weather.precipitation, 1, " mm")}</dd></div>
            <div className="info-row"><dt>Õhuniiskus</dt><dd>{formatNumber(weather.humidity, 0, " %")}</dd></div>
            <div className="info-row"><dt>Arvestatud ilmajaamu</dt><dd>{weather.stationCount}</dd></div>
            <div className="info-row"><dt>Arvutatud levikusuund</dt><dd>{spread && Number.isFinite(spread.degrees) ? `${spread.degrees!.toFixed(0)}° ${spread.name}` : "-"}</dd></div>
            <div className="info-row"><dt>Võimalik järgmine piirkond</dt><dd>{spread?.targetCounty ?? "-"}</dd></div>
            <div className="info-row"><dt>Riskitase</dt><dd>{spread ? `${spread.riskLevel} (${spread.score}/100)` : "-"}</dd></div>
          </dl>
          {spread ? (
            <div className="mt-3 rounded-md border border-orange-400/50 bg-orange-500/10 p-3">
              <p className="font-medium text-orange-100">{spread.explanation}</p>
              <ul className="mt-2 list-disc space-y-1 pl-4 text-xs text-muted-foreground">
                {spread.factors.map((factor) => <li key={factor}>{factor}</li>)}
              </ul>
            </div>
          ) : (
            <p className="mt-3 text-xs text-muted-foreground">Maakondlikke ilmaandmeid ei olnud piisavalt, et levikusuunda hinnata.</p>
          )}
        </div>
      ) : (
        <p className="rounded-lg border border-border/60 bg-background/35 p-3 text-muted-foreground">Selle valiku kohta ei leitud maakondlikku ilmaandmete rida.</p>
      )}

      {properties.length > 0 && (
        <div className="rounded-lg border border-border/60 bg-background/35 p-3">
          <h3 className="mb-2 font-semibold">Objekti andmed</h3>
          <dl className="grid gap-2">
            {properties.map(([key, value]) => (
              <div className="info-row" key={key}><dt>{readableKey(key)}</dt><dd>{String(value)}</dd></div>
            ))}
          </dl>
        </div>
      )}
    </div>
  );
}

function Index() {
  const [viewAreaId, setViewAreaId] = useState(WHOLE_ESTONIA.id);
  const [pestId, setPestId] = useState(PESTS[0].id);
  const [selection, setSelection] = useState<MapSelection | null>(null);
  const [showDamage, setShowDamage] = useState(true);
  const [showDangerZones, setShowDangerZones] = useState(true);
  const [weatherSummary, setWeatherSummary] = useState("Laen ilma- ja levikuandmeid...");

  const area = useMemo(() => AREAS.find((a) => a.id === viewAreaId) ?? WHOLE_ESTONIA, [viewAreaId]);
  const pest = useMemo(() => PESTS.find((p) => p.id === pestId) ?? PESTS[0], [pestId]);

  return (
    <div className="relative flex h-screen w-full flex-col overflow-hidden bg-transparent text-foreground">
      <SpruceBackground />
      <header className="flex items-center gap-4 border-b border-border/60 bg-card/40 px-6 py-4 backdrop-blur-sm">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-primary/40 bg-primary/10">
          <svg viewBox="0 0 32 52" className="h-6 w-6 text-primary" fill="currentColor" aria-hidden="true">
            <path d="M16 0 L24 14 L20 14 L28 26 L22 26 L32 40 L18 40 L18 52 L14 52 L14 40 L0 40 L10 26 L4 26 L12 14 L8 14 Z" />
          </svg>
        </div>
        <div>
          <h1 className="text-lg font-semibold tracking-tight">Üraski leviku riskikaart</h1>
          <p className="text-xs text-muted-foreground">RMK kahjustusalal klõpsamisel arvutatakse võimalik üraski levikusuund</p>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col gap-4 p-4 lg:flex-row lg:items-stretch">
        <main className="min-h-[55vh] flex-1 overflow-hidden rounded-xl border border-border shadow-lg lg:sticky lg:top-4 lg:h-full lg:min-h-0 lg:self-center">
          <ClientOnly fallback={<div className="flex h-full w-full items-center justify-center text-muted-foreground">Laen kaarti…</div>}>
            <EstoniaMap
              area={area}
              showWeather={true}
              showDamage={showDamage}
              showDangerZones={showDangerZones}
              onMapClick={setSelection}
              onWeatherSummary={setWeatherSummary}
            />
          </ClientOnly>
        </main>

        <aside className="flex w-full shrink-0 flex-col gap-4 overflow-y-auto pr-1 lg:h-full lg:w-96">
          <div className="rounded-xl border border-border/60 bg-card/75 p-5 shadow-lg backdrop-blur-sm">
            <h2 className="mb-4 text-base font-semibold">Kaardi valikud</h2>

            <label className="mb-1 block text-sm font-medium text-muted-foreground">Maakonna vaade</label>
            <select
              value="idle"
              onChange={(e) => {
                if (e.target.value !== "idle") setViewAreaId(e.target.value);
              }}
              className="mb-4 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="idle">Vali maakond ainult kaardi liigutamiseks</option>
              {AREAS.map((a) => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>
            <p className="-mt-2 mb-4 text-xs text-muted-foreground">Rippmenüü liigutab ainult kaardi vaadet. Infotabel täitub ainult punase RMK kahjustusala klõpsamisel.</p>

            <label className="mb-1 block text-sm font-medium text-muted-foreground">Kahjur</label>
            <select
              value={pestId}
              onChange={(e) => setPestId(e.target.value)}
              className="mb-4 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring"
            >
              {PESTS.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>

            <div className="space-y-2 text-sm">
              <label className="flex items-center gap-2"><input type="checkbox" checked={showDamage} onChange={(e) => setShowDamage(e.target.checked)} /> RMK kahjustusalad</label>
              <label className="flex items-center gap-2"><input type="checkbox" checked={showDangerZones} onChange={(e) => setShowDangerZones(e.target.checked)} /> Ühiseks liidetud ohuala</label>
            </div>
          </div>

          <div className="rounded-xl border border-border/60 bg-card/75 p-5 shadow-lg backdrop-blur-sm">
            <h2 className="mb-3 text-base font-semibold">Levikuhinnangu põhimõte</h2>
            <p className="text-sm text-muted-foreground">{weatherSummary}</p>
            <div className="mt-4 grid gap-2 text-sm">
              <div><span className="font-semibold text-red-300">Punane ala</span> = RMK registreeritud haige/kahjustatud metsaala.</div>
              <div><span className="font-semibold text-orange-300">Oranž ala</span> = RMK kahjustusaladest lähtuv ühiseks liidetud kallutatud ohuala. Ala on umbes 1 km ulatusega tuulesuunas ja liigub/zoomib kaardiga kaasa.</div>
              <div>Levikusuunda ei joonistata kaardile. Suund arvutatakse ja kuvatakse ainult infotabelis pärast punase ala klõpsu.</div>
            </div>
          </div>

          <div className="rounded-xl border border-border/60 bg-card/75 p-5 shadow-lg backdrop-blur-sm">
            <h2 className="mb-3 text-base font-semibold">Infotabel</h2>
            <InfoPanel selection={selection} pestName={pest.name} />
          </div>
        </aside>
      </div>
    </div>
  );
}
