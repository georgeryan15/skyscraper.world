import type { Feature } from "geojson";

export type BuildingPhoto = {
  src: string;
  credit: string;
  license: string;
  href: string;
};

export type BuildingDetails = {
  id: string;
  /** Feature id of the native landmark model in mapbox.mapbox-3dbuildings-v1. */
  modelId?: string;
  name: string;
  address: string;
  neighborhood: string;
  /** Longitude, latitude of the landmark model's footprint centroid. */
  coordinates?: [number, number];
  heightM: number;
  floors?: number;
  completed?: number;
  architect?: string;
  style?: string;
  summary: string;
  photo?: BuildingPhoto;
  /** No catalog entry matched; only the map's model data is known. */
  placeholder?: boolean;
};

// Placeholder catalog until a real data source is connected. Model queries
// return each tile's anchor rather than a building position, so towers are
// matched by model id. Photos are hotlinked from Wikimedia Commons and must
// keep their credit and licence.
export const MIDTOWN_TOWERS: BuildingDetails[] = [
  {
    id: "empire-state-building",
    modelId: "10256212561568024566",
    name: "Empire State Building",
    address: "350 Fifth Avenue",
    neighborhood: "Midtown South",
    coordinates: [-73.98564, 40.74842],
    heightM: 381,
    floors: 102,
    completed: 1931,
    architect: "Shreve, Lamb & Harmon",
    style: "Art Deco",
    summary:
      "Built in just over a year, it held the title of world's tallest building for nearly four decades. The antenna takes it to 443 m.",
    photo: {
      src: "https://upload.wikimedia.org/wikipedia/commons/1/10/Empire_State_Building_%28aerial_view%29.jpg",
      credit: "Sam Valadi",
      license: "Public domain",
      href: "https://commons.wikimedia.org/w/index.php?curid=62752443",
    },
  },
  {
    id: "chrysler-building",
    modelId: "17031054187970504179",
    name: "Chrysler Building",
    address: "405 Lexington Avenue",
    neighborhood: "East Midtown",
    coordinates: [-73.97536, 40.75162],
    heightM: 319,
    floors: 77,
    completed: 1930,
    architect: "William Van Alen",
    style: "Art Deco",
    summary:
      "The terraced stainless-steel crown made it the first building over 1,000 feet. It is still the tallest steel-framed brick building in the world.",
    photo: {
      src: "https://upload.wikimedia.org/wikipedia/commons/thumb/7/76/Chrysler_Building_by_David_Shankbone_Retouched.jpg/960px-Chrysler_Building_by_David_Shankbone_Retouched.jpg",
      credit: "David Shankbone, retouched by Overand",
      license: "Public domain",
      href: "https://commons.wikimedia.org/w/index.php?curid=6882882",
    },
  },
  {
    id: "one-vanderbilt",
    modelId: "1105267467003890196",
    name: "One Vanderbilt",
    address: "1 Vanderbilt Avenue",
    neighborhood: "East Midtown",
    coordinates: [-73.97854, 40.75297],
    heightM: 427,
    floors: 62,
    completed: 2020,
    architect: "Kohn Pedersen Fox",
    style: "Contemporary",
    summary:
      "Its tapering terracotta facade nods to the Chrysler Building nearby. An underground concourse links the tower directly to Grand Central.",
    photo: {
      src: "https://upload.wikimedia.org/wikipedia/commons/thumb/0/00/One_Vanderbilt_April_2023.jpg/960px-One_Vanderbilt_April_2023.jpg",
      credit: "Percival Kestreltail",
      license: "CC BY-SA 4.0",
      href: "https://commons.wikimedia.org/w/index.php?curid=130772934",
    },
  },
  {
    id: "270-park-avenue",
    modelId: "12520060009192000714",
    name: "270 Park Avenue",
    address: "270 Park Avenue",
    neighborhood: "East Midtown",
    coordinates: [-73.97597, 40.75598],
    heightM: 423,
    floors: 60,
    completed: 2025,
    architect: "Foster + Partners",
    style: "Contemporary",
    summary:
      "JPMorganChase's headquarters stands on a fan-column base that lifts the tower above the street. It replaced the bank's earlier tower on the same site.",
    photo: {
      src: "https://upload.wikimedia.org/wikipedia/commons/thumb/2/25/270_Park_Avenue_Photomontage_%28cropped%29.jpg/960px-270_Park_Avenue_Photomontage_%28cropped%29.jpg",
      credit: "CrossingLights",
      license: "CC BY 4.0",
      href: "https://commons.wikimedia.org/w/index.php?curid=196443393",
    },
  },
  {
    id: "30-rockefeller-plaza",
    modelId: "2938463677355617362",
    name: "30 Rockefeller Plaza",
    address: "30 Rockefeller Plaza",
    neighborhood: "Rockefeller Center",
    coordinates: [-73.97966, 40.75917],
    heightM: 259,
    floors: 66,
    completed: 1933,
    architect: "Raymond Hood",
    style: "Art Deco",
    summary:
      "The centrepiece of Rockefeller Center and home to NBC's studios. The observation deck at the top is known as Top of the Rock.",
    photo: {
      src: "https://upload.wikimedia.org/wikipedia/commons/thumb/5/58/30_Rockefeller_Plaza_view_from_Empire_State_Building%2C_around_1_pm.jpg/960px-30_Rockefeller_Plaza_view_from_Empire_State_Building%2C_around_1_pm.jpg",
      credit: "David.Cole",
      license: "CC BY-SA 4.0",
      href: "https://commons.wikimedia.org/w/index.php?curid=195049102",
    },
  },
  {
    id: "central-park-tower",
    modelId: "11021918850935045346",
    name: "Central Park Tower",
    address: "217 West 57th Street",
    neighborhood: "Billionaires' Row",
    coordinates: [-73.98092, 40.76638],
    heightM: 472,
    floors: 98,
    completed: 2020,
    architect: "Adrian Smith + Gordon Gill",
    style: "Contemporary",
    summary:
      "The tallest residential building in the world. A cantilever on its east side opens Central Park views from the upper floors.",
    photo: {
      src: "https://upload.wikimedia.org/wikipedia/commons/thumb/8/81/Central_Park_Tower_April_2021.jpg/960px-Central_Park_Tower_April_2021.jpg",
      credit: "Percival Kestreltail",
      license: "CC BY-SA 3.0",
      href: "https://commons.wikimedia.org/w/index.php?curid=106582145",
    },
  },
  {
    id: "432-park-avenue",
    modelId: "10816826466631753493",
    name: "432 Park Avenue",
    address: "432 Park Avenue",
    neighborhood: "Billionaires' Row",
    coordinates: [-73.97185, 40.7617],
    heightM: 426,
    floors: 85,
    completed: 2015,
    architect: "Rafael Viñoly",
    style: "Modernist",
    summary:
      "A slender concrete grid of identical square windows. Open floors every twelve storeys let wind pass through the tower.",
    photo: {
      src: "https://upload.wikimedia.org/wikipedia/commons/thumb/1/10/432_Park_Avenue%2C_NY_%28cropped%292.jpg/960px-432_Park_Avenue%2C_NY_%28cropped%292.jpg",
      credit: "Percival Kestreltail",
      license: "CC BY-SA 4.0",
      href: "https://commons.wikimedia.org/w/index.php?curid=122145711",
    },
  },
  {
    id: "111-west-57th-street",
    modelId: "9126799436238956810",
    name: "Steinway Tower",
    address: "111 West 57th Street",
    neighborhood: "Billionaires' Row",
    coordinates: [-73.97756, 40.76495],
    heightM: 435,
    floors: 84,
    completed: 2021,
    architect: "SHoP Architects",
    style: "Neo–Art Deco",
    summary:
      "One of the most slender skyscrapers ever built, with terracotta and bronze bands on its facade. It rises behind the 1925 Steinway Hall.",
    photo: {
      src: "https://upload.wikimedia.org/wikipedia/commons/e/e4/05_23_2022_Supertall_Building_111_West_57th_Street_from_Roof_NYC.jpg",
      credit: "Wil540 art",
      license: "CC BY-SA 4.0",
      href: "https://commons.wikimedia.org/w/index.php?curid=135723154",
    },
  },
  {
    id: "bank-of-america-tower",
    modelId: "2268778884766788792",
    name: "Bank of America Tower",
    address: "1111 Avenue of the Americas",
    neighborhood: "Bryant Park",
    coordinates: [-73.98472, 40.75556],
    heightM: 366,
    floors: 55,
    completed: 2009,
    architect: "COOKFOX",
    style: "Contemporary",
    summary:
      "Faceted glass walls catch light from every direction. The tower was among the first skyscrapers designed to the highest green-building rating.",
    photo: {
      src: "https://upload.wikimedia.org/wikipedia/commons/thumb/d/d5/Bank_of_America_Tower_-_2025_%2854821833478%29.jpg/960px-Bank_of_America_Tower_-_2025_%2854821833478%29.jpg",
      credit: "Ajay Suresh",
      license: "CC BY 4.0",
      href: "https://commons.wikimedia.org/w/index.php?curid=175831444",
    },
  },
  {
    id: "metlife-building",
    modelId: "6223906306531942618",
    name: "MetLife Building",
    address: "200 Park Avenue",
    neighborhood: "East Midtown",
    coordinates: [-73.97665, 40.75351],
    heightM: 246,
    floors: 59,
    completed: 1962,
    architect: "Emery Roth & Sons, Walter Gropius",
    style: "International",
    summary:
      "Its broad octagonal slab straddles Park Avenue just north of Grand Central. It opened as the largest commercial office building in the world.",
    photo: {
      src: "https://upload.wikimedia.org/wikipedia/commons/thumb/4/43/MetLife_Building.jpg/960px-MetLife_Building.jpg",
      credit: "Choinowski",
      license: "CC BY-SA 4.0",
      href: "https://commons.wikimedia.org/w/index.php?curid=148623496",
    },
  },
];

export const TALLEST_HEIGHT_M = Math.max(...MIDTOWN_TOWERS.map((tower) => tower.heightM));

export function describeBuilding(feature: Feature): BuildingDetails {
  const match = MIDTOWN_TOWERS.find((tower) => tower.modelId === String(feature.id));
  if (match) return match;
  const height = Number(feature.properties?.height);
  return {
    id: `model-${feature.id}`,
    modelId: String(feature.id),
    name: "Unnamed tower",
    address: "Midtown Manhattan",
    neighborhood: "",
    heightM: Number.isFinite(height) ? Math.round(height) : 0,
    summary: "There are no details for this tower yet. Its height comes from the map's 3D model.",
    placeholder: true,
  };
}

export function toFeet(metres: number): string {
  return Math.round(metres * 3.28084).toLocaleString("en-US");
}
