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
      { title: "Üraski leviku kaart" },
      {
        name: "description",
        content: "Eesti kuuse-kooreüraski leviku riskikaart RMK kahjustusalade ja ilmaandmete põhjal.",
      },
      { property: "og:title", content: "Üraski leviku kaart" },
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


type RiskRecommendationLevel = 1 | 2 | 3;

function recommendationLevelForScore(value: number | null | undefined): RiskRecommendationLevel | null {
  if (!Number.isFinite(value)) return null;
  const score = Math.round(value as number);
  if (score >= 70) return 3;
  if (score >= 45) return 2;
  return 1;
}

function riskLevelLabel(level: RiskRecommendationLevel | null) {
  if (level === 3) return "kõrge ohutase";
  if (level === 2) return "keskmine ohutase";
  if (level === 1) return "madal ohutase";
  return "ohutase puudub";
}

type RiskRecommendation = {
  level: RiskRecommendationLevel;
  title: string;
  subtitle: string;
  description: string;
  months: string;
};

const RISK_RECOMMENDATIONS: Record<RiskRecommendationLevel, RiskRecommendation> = {
  3: {
    level: 3,
    title: "Intensiivne seire ja kiire reageerimine",
    subtitle: "Kõrge ohutase",
    months: "aprill, august ja september",
    description:
      "Tee tugevdatud seiret aprillis, augustis ja septembris, eriti tihedamates kuuseosades. Jälgi üraskikahjustusi, nõrgenenud puid, tormikahjustusi ning põuakahjustusi. Pärast suuremaid torme ja kuuma põuaperioodi tuleb ala üle vaadata ning vajadusel kahjustatud või ohtlik materjal eemaldada.",
  },
  2: {
    level: 2,
    title: "Sihitud seire riskikohtades",
    subtitle: "Keskmine ohutase",
    months: "aprill ja september",
    description:
      "Tee metsaseiret vähemalt kaks korda aastas: aprillis ja septembris. Pärast iga suuremat tormi tuleb mets üle vaadata ning vajadusel puhastada. Lisaks tee kevadel, aprillis, kuusemetsas põhjalikum ülevaatus ja riskikohtade puhastus.",
  },
  1: {
    level: 1,
    title: "Üldine jälgimine",
    subtitle: "Madal ohutase",
    months: "aprill ja august või september",
    description:
      "Tee üldist metsaseiret kaks korda aastas: aprillis ning augustis või septembris. Kevadel, aprillis, tee kuusemetsas suurem ülevaatus ja vajadusel puhastus. Kontrolli ala aeg-ajalt, eriti pärast ekstreemseid ilmastikuolusid.",
  },
};

function RecommendationModal({ recommendation, onClose }: { recommendation: RiskRecommendation | null; onClose: () => void }) {
  if (!recommendation) return null;

  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/65 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="risk-recommendation-title" onClick={onClose}>
      <div className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-2xl border border-border/70 bg-card p-6 shadow-2xl" onClick={(event) => event.stopPropagation()}>
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <div className="text-xs uppercase tracking-wide text-muted-foreground">Ohutase {recommendation.level} · {recommendation.subtitle}</div>
            <h2 id="risk-recommendation-title" className="mt-1 text-xl font-semibold text-foreground">{recommendation.title}</h2>
          </div>
          <button type="button" className="rounded-md border border-border/70 px-3 py-1 text-sm hover:bg-muted" onClick={onClose} aria-label="Sulge soovituse aken">Sulge</button>
        </div>

        <div className="space-y-4 text-sm leading-relaxed text-muted-foreground">
          <div className="rounded-lg border border-border/60 bg-background/35 p-3">
            <div className="font-medium text-foreground">Soovitatud seireperiood</div>
            <div>{recommendation.months}</div>
          </div>
          <p>{recommendation.description}</p>
          <p className="text-xs">Märkus: soovitus on seotud kaardil arvutatud suhtelise riskitasemega. Lõplik metsamajanduslik otsus vajab kohapealset kontrolli.</p>
        </div>
      </div>
    </div>
  );
}

function RiskRecommendationButtons({ colorBlindMode, onSelect }: { colorBlindMode: boolean; onSelect: (recommendation: RiskRecommendation) => void }) {
  const levels: RiskRecommendationLevel[] = [3, 2, 1];

  const regularClasses: Record<RiskRecommendationLevel, string> = {
    3: "border-orange-500/70 bg-orange-500/20 text-orange-100 hover:bg-orange-500/30",
    2: "border-yellow-400/70 bg-yellow-400/20 text-yellow-100 hover:bg-yellow-400/30",
    1: "border-lime-300/70 bg-lime-400/20 text-lime-100 hover:bg-lime-400/30",
  };
  const colorBlindClasses: Record<RiskRecommendationLevel, string> = {
    3: "border-purple-400/70 bg-purple-500/25 text-purple-100 hover:bg-purple-500/35",
    2: "border-amber-300/70 bg-amber-400/20 text-amber-100 hover:bg-amber-400/30",
    1: "border-sky-300/70 bg-sky-400/20 text-sky-100 hover:bg-sky-400/30",
  };

  return (
    <div className="mt-4 rounded-lg border border-border/60 bg-background/30 p-3">
      <div className="mb-2 text-sm font-semibold">Reageerimissoovitused</div>
      <div className="grid gap-2">
        {levels.map((level) => {
          const recommendation = RISK_RECOMMENDATIONS[level];
          return (
            <button
              key={level}
              type="button"
              className={`rounded-md border px-3 py-2 text-left text-sm transition ${colorBlindMode ? colorBlindClasses[level] : regularClasses[level]}`}
              onClick={() => onSelect(recommendation)}
            >
              <span className="font-semibold">Ohutase {level}</span> — {recommendation.title}
            </button>
          );
        })}
      </div>
      <p className="mt-2 text-xs text-muted-foreground">Klõpsa ohutasemel, et näha täpsemat tegutsemisjuhist.</p>
    </div>
  );
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

function InfoPanel({ selection, onRecommendationSelect }: { selection: MapSelection | null; onRecommendationSelect: (recommendation: RiskRecommendation) => void }) {
  if (!selection) {
    return <p className="text-sm text-muted-foreground">Klõpsa punasel RMK kahjustusalal. Infotabelisse kuvatakse arvutus ainult haige metsa valimisel; tavaline kaardiklõps või maakond infot ei ava.</p>;
  }

  const weather = selection.weather;
  const spread = selection.spread;
  const cadastralText = selection.cadastralIds?.length ? selection.cadastralIds.join(", ") : "andmefailis puudub";
  const forestAgeText = selection.forestAge !== null && selection.forestAge !== undefined && selection.forestAge !== "" ? `${selection.forestAge} aastat` : "andmefailis puudub";
  const forestRiskText = selection.forestRiskScore !== null && selection.forestRiskScore !== undefined ? `${selection.forestRiskLevel} (${selection.forestRiskScore}/100)` : "-";
  const forestRecommendationLevel = selection.type === "spruce" ? recommendationLevelForScore(selection.forestRiskScore) : null;
  const forestRecommendation = forestRecommendationLevel ? RISK_RECOMMENDATIONS[forestRecommendationLevel] : null;
  const forestRecommendationText = forestRecommendation ? `Ohutase ${forestRecommendation.level} — ${forestRecommendation.title}` : "-";
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
        {selection.type === "spruce" && <div className="info-row"><dt>Soovitatud tegevustase</dt><dd>{forestRecommendationText}</dd></div>}
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
              {forestRecommendation ? (
                <div className="mt-3 rounded-md border border-border/60 bg-background/35 p-3">
                  <div className="text-xs uppercase tracking-wide text-muted-foreground">Selle metsa reageerimissoovitus</div>
                  <div className="mt-1 font-semibold text-foreground">Ohutase {forestRecommendation.level} — {riskLevelLabel(forestRecommendation.level)}</div>
                  <div className="mt-1 text-xs text-muted-foreground">Vajuta legendis soovitusele “Ohutase {forestRecommendation.level}” või ava see siit.</div>
                  <button
                    type="button"
                    className="mt-2 rounded-md border border-orange-300/60 bg-orange-400/20 px-3 py-1.5 text-xs font-medium text-orange-100 transition hover:bg-orange-400/30"
                    onClick={() => onRecommendationSelect(forestRecommendation)}
                  >
                    Ava ohutase {forestRecommendation.level} soovitus
                  </button>
                </div>
              ) : null}
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
  const [colorBlindMode, setColorBlindMode] = useState(false);
  const [riskRecommendation, setRiskRecommendation] = useState<RiskRecommendation | null>(null);

  const area = useMemo(() => AREAS.find((a) => a.id === viewAreaId) ?? WHOLE_ESTONIA, [viewAreaId]);

  return (
    <div className="relative flex h-screen w-full flex-col overflow-hidden bg-transparent text-foreground">
      <SpruceBackground />
      <RecommendationModal recommendation={riskRecommendation} onClose={() => setRiskRecommendation(null)} />
      <header className="flex items-center gap-4 border-b border-border/60 bg-card/40 px-6 py-4 backdrop-blur-sm">
        <div className="min-w-0">
          <h1 className="text-lg font-semibold tracking-tight">Üraski leviku kaart</h1>
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
              colorBlindMode={colorBlindMode}
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
              <label className="flex items-center gap-2"><input type="checkbox" checked={colorBlindMode} onChange={(e) => setColorBlindMode(e.target.checked)} /> Värvipimeda režiim</label>
              <p className="pl-5 text-xs text-muted-foreground">Jõudluse huvides kuvatakse kuusepolügonid alles piirkonda sisse suumides.</p>
            </div>
          </div>

          <div className="rounded-xl border border-border/60 bg-card/75 p-5 shadow-lg backdrop-blur-sm">
            <h2 className="mb-3 text-base font-semibold">Kaardi legend</h2>
            {colorBlindMode ? (
              <div className="grid gap-2 text-sm">
                <div><span className="inline-block h-3 w-5 rounded-sm bg-black align-middle"></span> <span className="font-semibold text-slate-100">Must/tume</span> = RMK registreeritud kolle.</div>
                <div><span className="inline-block h-3 w-5 rounded-sm bg-violet-200/70 align-middle"></span> <span className="font-semibold text-violet-200">Hele lilla</span> = arvutatud leviala.</div>
                <div className="mt-1 h-3 rounded-full bg-gradient-to-r from-sky-100 via-sky-400 to-blue-800"></div>
                <div><span className="font-semibold text-sky-200">Sinine gradient</span> = levialast väljas olevad safe-zone kuusemetsad.</div>
                <div className="mt-1 h-3 rounded-full bg-gradient-to-r from-yellow-200 via-amber-400 to-purple-700"></div>
                <div><span className="font-semibold text-yellow-200">Kollane</span> → <span className="font-semibold text-purple-300">lilla</span> = leviala sees või kontuuriga lõikuv mets, tumedam toon tähendab kõrgemat ohutaset.</div>
              </div>
            ) : (
              <div className="grid gap-2 text-sm">
                <div><span className="inline-block h-3 w-5 rounded-sm bg-red-600 align-middle"></span> <span className="font-semibold text-red-300">Punane</span> = RMK registreeritud kolle.</div>
                <div><span className="inline-block h-3 w-5 rounded-sm bg-orange-300/70 align-middle"></span> <span className="font-semibold text-orange-300">Hele oranž</span> = arvutatud leviala.</div>
                <div className="mt-1 h-3 rounded-full bg-gradient-to-r from-green-200 via-green-500 to-green-800"></div>
                <div><span className="font-semibold text-green-300">Roheline gradient</span> = levialast väljas olevad safe-zone kuusemetsad.</div>
                <div className="mt-1 h-3 rounded-full bg-gradient-to-r from-yellow-200 via-yellow-400 to-orange-600"></div>
                <div><span className="font-semibold text-yellow-200">Hele kollane</span> → <span className="font-semibold text-orange-300">oranž</span> = leviala kontuuri sees või kontuuriga lõikuv mets, tumedam toon tähendab kõrgemat ohutaset.</div>
              </div>
            )}
            <RiskRecommendationButtons colorBlindMode={colorBlindMode} onSelect={setRiskRecommendation} />
          </div>

          <div className="rounded-xl border border-border/60 bg-card/75 p-5 shadow-lg backdrop-blur-sm">
            <h2 className="mb-3 text-base font-semibold">Infotabel</h2>
            <InfoPanel selection={selection} onRecommendationSelect={setRiskRecommendation} />
          </div>
        </aside>
      </div>
    </div>
  );
}
