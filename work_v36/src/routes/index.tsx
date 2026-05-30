import { createFileRoute } from "@tanstack/react-router";
import { ClientOnly } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { EstoniaMap, type MapSelection } from "@/components/EstoniaMap";
import { PwaInstallBanner } from "@/components/PwaInstallBanner";
import { SpruceBackground } from "@/components/SpruceBackground";
import { AREAS, WHOLE_ESTONIA } from "@/lib/estonia";

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

function formatRisk(value: number | null | undefined) {
  if (!Number.isFinite(value)) return "-";
  const score = Math.round(value as number);
  const level = score >= 70 ? "kõrge" : score >= 45 ? "keskmine" : "madal";
  return `${level} (${score}/100)`;
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
    keskm_vanus: "Metsa keskmine vanus",
    peapuuliik_kood: "Peapuuliik",
    kvartali_nr: "Kvartal",
    eraldise_nr: "Eraldis",
    kasvukoht_kood: "Kasvukoht",
    arengukl_kood: "Arenguklass",
  };
  return labels[key] ?? key.replaceAll("_", " ");
}

function InfoPanel({ selection }: { selection: MapSelection | null }) {
  if (!selection) {
    return <p className="text-sm text-muted-foreground">Klõpsa punasel RMK kahjustusalal. Infotabelisse kuvatakse arvutus ainult haige metsa valimisel; tavaline kaardiklõps või maakond infot ei ava.</p>;
  }

  const weather = selection.weather;
  const spread = selection.spread;
  const cadastralText = selection.cadastralIds?.length ? selection.cadastralIds.join(", ") : "andmefailis puudub";
  const forestAgeText = selection.forestAge !== null && selection.forestAge !== undefined && selection.forestAge !== "" ? `${selection.forestAge} aastat` : "andmefailis puudub";
  const forestRiskText = selection.forestRiskScore !== null && selection.forestRiskScore !== undefined ? `${selection.forestRiskLevel} (${selection.forestRiskScore}/100)` : "-";
  const forestDistanceText = selection.forestDistanceToDamageM !== null && selection.forestDistanceToDamageM !== undefined ? `${selection.forestDistanceToDamageM.toFixed(0)} m` : "-";
  const forestNdviText = selection.forestNdvi !== null && selection.forestNdvi !== undefined ? selection.forestNdvi.toFixed(2) : "andmetes puudub";
  const infected = selection.infectedSpruce;
  const infectedForests = infected?.forests ?? [];
  const shownInfectedForests = infectedForests.slice(0, 8);
  const infectedRiskText = formatRisk(infected?.avg_risk);
  const properties = Object.entries(selection.properties ?? {}).slice(0, 14);

  return (
    <div className="space-y-4 text-sm">
      <div>
        <div className="text-xs uppercase tracking-wide text-muted-foreground">Valitud objekt</div>
        <div className="text-base font-semibold">{selection.title ?? selection.countyName ?? "Valitud asukoht"}</div>
      </div>

      <dl className="grid gap-2">
        <div className="info-row"><dt>Maakond</dt><dd>{selection.countyName ?? "-"}</dd></div>
        <div className="info-row"><dt>Koordinaadid</dt><dd>{selection.lat.toFixed(5)}, {selection.lng.toFixed(5)}</dd></div>
        <div className="info-row"><dt>Katastritunnus</dt><dd>{cadastralText}</dd></div>
        <div className="info-row"><dt>Metsa keskmine vanus</dt><dd>{forestAgeText}</dd></div>
        {selection.type === "damage" && <div className="info-row"><dt>Koldega seotud kuuseeraldisi</dt><dd>{infected ? `${infected.forest_count} tk` : "ei leitud"}</dd></div>}
        {selection.type === "damage" && <div className="info-row"><dt>Kolde kuusemetsade keskmine risk</dt><dd>{infectedRiskText}</dd></div>}
        {selection.type === "spruce" && <div className="info-row"><dt>Metsa riskitase</dt><dd>{forestRiskText}</dd></div>}
        {selection.type === "spruce" && <div className="info-row"><dt>Kaugus lähimast koldest</dt><dd>{forestDistanceText}</dd></div>}
        {selection.type === "spruce" && <div className="info-row"><dt>NDVI</dt><dd>{forestNdviText}</dd></div>}
        <div className="info-row"><dt>Ohuala kuju</dt><dd>{selection.dangerZoneDownwindKm ? "1 km ring, tuulesuunas venitatud kuni 2 km" : "-"}</dd></div>
        <div className="info-row"><dt>Ohuala ulatus levikusuunas</dt><dd>{selection.dangerZoneDownwindKm ? `${selection.dangerZoneDownwindKm} km` : "-"}</dd></div>
        <div className="info-row"><dt>Ohuala külgsuunas</dt><dd>{selection.dangerZoneLateralKm ? `${selection.dangerZoneLateralKm} km` : "-"}</dd></div>
        <div className="info-row"><dt>Ohuala vastutuules</dt><dd>{selection.dangerZoneUpwindKm ? `${selection.dangerZoneUpwindKm} km` : "-"}</dd></div>
      </dl>

      {weather ? (
        <div className="rounded-lg border border-border/60 bg-background/35 p-3">
          <h3 className="mb-2 font-semibold">{selection.type === "damage" ? "Levikuhinnang valitud haigest metsaalast" : "Ilmaandmed valitud kuuseeraldisel"}</h3>
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
          {selection.type === "damage" && spread ? (
            <div className="mt-3 rounded-md border border-orange-400/50 bg-orange-500/10 p-3">
              <p className="font-medium text-orange-100">{spread.explanation}</p>
              <ul className="mt-2 list-disc space-y-1 pl-4 text-xs text-muted-foreground">
                {spread.factors.map((factor) => <li key={factor}>{factor}</li>)}
              </ul>
            </div>
          ) : selection.type === "damage" ? (
            <p className="mt-3 text-xs text-muted-foreground">Maakondlikke ilmaandmeid ei olnud piisavalt, et levikusuunda hinnata.</p>
          ) : selection.type === "spruce" ? (
            <div className="mt-3 rounded-md border border-orange-400/40 bg-orange-500/10 p-3">
              <p className="font-medium text-orange-100">Kuuseeralduse risk arvutatakse vanuse, lähima kolde kauguse, NDVI olemasolu korral metsa tervise ning temperatuuri põhjal.</p>
              {selection.forestRiskFactors?.length ? (
                <ul className="mt-2 list-disc space-y-1 pl-4 text-xs text-muted-foreground">
                  {selection.forestRiskFactors.map((factor) => <li key={factor}>{factor}</li>)}
                </ul>
              ) : null}
            </div>
          ) : (
            <p className="mt-3 text-xs text-muted-foreground">Kuuseeraldisel kuvatakse metsa andmed. Üraski levikuarvutus käivitub endiselt punase RMK kahjustusala klõpsamisel.</p>
          )}
        </div>
      ) : (
        <p className="rounded-lg border border-border/60 bg-background/35 p-3 text-muted-foreground">Selle valiku kohta ei leitud maakondlikku ilmaandmete rida.</p>
      )}


      {selection.type === "damage" && infected ? (
        <div className="rounded-lg border border-red-400/45 bg-red-500/10 p-3">
          <h3 className="mb-2 font-semibold">Koldega kattuvad kuusemetsad</h3>
          <dl className="grid gap-2">
            <div className="info-row"><dt>Kuuseeraldiste arv</dt><dd>{infected.forest_count}</dd></div>
            <div className="info-row"><dt>Keskmine vanus</dt><dd>{infected.avg_age !== null && infected.avg_age !== undefined ? `${infected.avg_age} aastat` : "andmetes puudub"}</dd></div>
            <div className="info-row"><dt>Keskmine NDVI</dt><dd>{infected.avg_ndvi !== null && infected.avg_ndvi !== undefined ? infected.avg_ndvi.toFixed(3) : "andmetes puudub"}</dd></div>
            <div className="info-row"><dt>Keskmine risk</dt><dd>{infectedRiskText}</dd></div>
            <div className="info-row"><dt>Kõrge / keskmine / madal</dt><dd>{infected.high_risk_count ?? 0} / {infected.medium_risk_count ?? 0} / {infected.low_risk_count ?? 0}</dd></div>
          </dl>
          {shownInfectedForests.length ? (
            <div className="mt-3 space-y-2">
              <div className="text-xs uppercase tracking-wide text-muted-foreground">Näited koldega seotud metsadest</div>
              {shownInfectedForests.map((forest, index) => (
                <div className="rounded-md border border-border/50 bg-background/30 p-2 text-xs" key={`${forest.id ?? index}-${forest.katastri_nr ?? ""}`}>
                  <div className="font-medium">ID {forest.id ?? "-"} · risk {formatRisk(forest.risk_score)}</div>
                  <div className="text-muted-foreground">Kataster: {forest.katastri_nr ?? "-"}; vanus: {forest.keskm_vanus ?? "-"}; NDVI: {forest.ndvi !== null && forest.ndvi !== undefined ? forest.ndvi.toFixed(3) : "-"}; kaugus: {forest.distance_m !== null && forest.distance_m !== undefined ? `${Math.round(forest.distance_m)} m` : "-"}</div>
                </div>
              ))}
              {infected.truncated || infectedForests.length > shownInfectedForests.length ? (
                <div className="text-xs text-muted-foreground">Nimekiri on tabeli loetavuse jaoks lühendatud.</div>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}

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
  const [selection, setSelection] = useState<MapSelection | null>(null);
  const [showDamage, setShowDamage] = useState(true);
  const [showDangerZones, setShowDangerZones] = useState(true);
  const [showSpruceForests, setShowSpruceForests] = useState(true);

  const area = useMemo(() => AREAS.find((a) => a.id === viewAreaId) ?? WHOLE_ESTONIA, [viewAreaId]);

  return (
    <div className="relative flex h-screen w-full flex-col overflow-hidden bg-transparent text-foreground">
      <SpruceBackground />
      <header className="flex items-center gap-4 border-b border-border/60 bg-card/40 px-6 py-4 backdrop-blur-sm">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-primary/40 bg-primary/10">
          <svg viewBox="0 0 32 52" className="h-6 w-6 text-primary" fill="currentColor" aria-hidden="true">
            <path d="M16 0 L24 14 L20 14 L28 26 L22 26 L32 40 L18 40 L18 52 L14 52 L14 40 L0 40 L10 26 L4 26 L12 14 L8 14 Z" />
          </svg>
        </div>
        <div className="min-w-0">
          <h1 className="text-lg font-semibold tracking-tight">Üraski leviku riskikaart</h1>
          <p className="text-xs text-muted-foreground">RMK kahjustusalal klõpsamisel arvutatakse võimalik üraski levikusuund</p>
        </div>
        <div className="ml-auto shrink-0">
          <PwaInstallBanner />
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
              showSpruceForests={showSpruceForests}
              onMapClick={setSelection}
                          />
          </ClientOnly>
        </main>

        <aside className="flex w-full shrink-0 flex-col gap-4 overflow-y-auto pr-1 lg:h-full lg:w-96">
          <div className="rounded-xl border border-border/60 bg-card/75 p-5 shadow-lg backdrop-blur-sm">
            <h2 className="mb-4 text-base font-semibold">Kaardi valikud</h2>

            <label className="mb-1 block text-sm font-medium text-muted-foreground">Maakonna vaade</label>
            <select
              value={viewAreaId}
              onChange={(e) => setViewAreaId(e.target.value)}
              className="mb-4 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring"
            >
              {AREAS.map((a) => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>
            <p className="-mt-2 mb-4 text-xs text-muted-foreground">Valitud maakond jääb menüüs nähtavaks. Infotabel täitub kaardiobjekti klõpsamisel.</p>

            <div className="space-y-2 text-sm">
              <label className="flex items-center gap-2"><input type="checkbox" checked={showDamage} onChange={(e) => setShowDamage(e.target.checked)} /> RMK kahjustusalad</label>
              <label className="flex items-center gap-2"><input type="checkbox" checked={showDangerZones} onChange={(e) => setShowDangerZones(e.target.checked)} /> Levikuala</label>
              <label className="flex items-center gap-2"><input type="checkbox" checked={showSpruceForests} onChange={(e) => setShowSpruceForests(e.target.checked)} /> Kuusemetsad / metsaeraldised</label>
              <p className="pl-5 text-xs text-muted-foreground">Jõudluse huvides kuvatakse kuusepolügonid alles piirkonda sisse suumides.</p>
            </div>
          </div>

          <div className="rounded-xl border border-border/60 bg-card/75 p-5 shadow-lg backdrop-blur-sm">
            <h2 className="mb-3 text-base font-semibold">Kaardi legend</h2>
            <div className="grid gap-2 text-sm">
              <div><span className="inline-block h-3 w-5 rounded-sm bg-red-600 align-middle"></span> <span className="font-semibold text-red-300">Punane</span> = RMK registreeritud kolle.</div>
              <div><span className="inline-block h-3 w-5 rounded-sm bg-orange-300/70 align-middle"></span> <span className="font-semibold text-orange-300">Hele oranž</span> = arvutatud leviala.</div>
              <div><span className="inline-block h-3 w-5 rounded-sm bg-green-600 align-middle"></span> <span className="font-semibold text-green-300">Roheline</span> = kuusemets väljaspool leviala.</div>
              <div className="mt-1 h-3 rounded-full bg-gradient-to-r from-yellow-200 via-yellow-400 to-orange-600"></div>
              <div><span className="font-semibold text-green-300">Roheline</span> = levialast väljas olev kuusemets. <span className="font-semibold text-yellow-200">Hele kollane</span> → <span className="font-semibold text-orange-300">oranž</span> = levialas oleva metsa kasvav ohutase.</div>
            </div>
          </div>

          <div className="rounded-xl border border-border/60 bg-card/75 p-5 shadow-lg backdrop-blur-sm">
            <h2 className="mb-3 text-base font-semibold">Infotabel</h2>
            <InfoPanel selection={selection} />
          </div>
        </aside>
      </div>
    </div>
  );
}
