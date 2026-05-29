export type Area = {
  id: string;
  name: string;
  center: [number, number];
  zoom: number;
};

// The whole-Estonia overview – this is the global starting point and the
// maximum zoom-out level. You can only zoom IN from here.
export const WHOLE_ESTONIA: Area = {
  id: "all",
  name: "Terve Eesti",
  center: [58.75, 25.0],
  zoom: 7,
};

// "Terve Eesti" overview + all 15 Estonian maakonnad (provinces)
export const AREAS: Area[] = [
  WHOLE_ESTONIA,
  { id: "harjumaa", name: "Harjumaa", center: [59.33, 25.0], zoom: 9 },
  { id: "hiiumaa", name: "Hiiumaa", center: [58.92, 22.6], zoom: 10 },
  { id: "ida-virumaa", name: "Ida-Virumaa", center: [59.27, 27.4], zoom: 9 },
  { id: "jogevamaa", name: "Jõgevamaa", center: [58.75, 26.4], zoom: 9 },
  { id: "jarvamaa", name: "Järvamaa", center: [58.88, 25.6], zoom: 9 },
  { id: "laanemaa", name: "Läänemaa", center: [58.95, 23.8], zoom: 9 },
  { id: "laane-virumaa", name: "Lääne-Virumaa", center: [59.25, 26.3], zoom: 9 },
  { id: "polvamaa", name: "Põlvamaa", center: [58.06, 27.05], zoom: 9 },
  { id: "parnumaa", name: "Pärnumaa", center: [58.38, 24.5], zoom: 9 },
  { id: "raplamaa", name: "Raplamaa", center: [58.95, 24.7], zoom: 9 },
  { id: "saaremaa", name: "Saaremaa", center: [58.4, 22.5], zoom: 9 },
  { id: "tartumaa", name: "Tartumaa", center: [58.38, 26.7], zoom: 9 },
  { id: "valgamaa", name: "Valgamaa", center: [57.92, 26.0], zoom: 9 },
  { id: "viljandimaa", name: "Viljandimaa", center: [58.36, 25.6], zoom: 9 },
  { id: "vorumaa", name: "Võrumaa", center: [57.83, 27.0], zoom: 9 },
];

export type Pest = {
  id: string;
  name: string;
};

export const PESTS: Pest[] = [{ id: "urask", name: "Ürask" }];
