import { withBase } from '../config/paths';

export type PlanetKind = 'rocky-hot' | 'rocky-temperate' | 'gas-giant' | 'ice-giant';

export interface StarData {
  name: string;
  spectralType: string;
  massSolar: number;
  radiusSolar: number;
  temperatureK: number;
  luminositySolar: number;
}

export interface PlanetData {
  id: string;
  name: string;
  conceptLabel: string;
  catalogName: string;
  kind: PlanetKind;
  kindLabel: string;
  massEarth: number;
  radiusEarth: number;
  semiMajorAxisAu: number;
  eccentricity: number;
  orbitalPeriodDays: number;
  inclinationDeg: number;
  rotationHours: number;
  obliquityDeg: number;
  bondAlbedo: number;
  equilibriumTemperatureK: number;
  palette: [string, string, string];
  texturePath: string;
  cloudTexturePath?: string;
  textureTint?: string;
  initialPhase: number;
  hasAtmosphere: boolean;
  hasRings?: boolean;
}

export const star: StarData = {
  name: 'Noventure A',
  spectralType: 'G2–G3 V',
  massSolar: 1.02,
  radiusSolar: 1.01,
  temperatureK: 5820,
  luminositySolar: 1.054,
};

export const planets: PlanetData[] = [
  {
    id: 'cinder',
    name: 'Audacia',
    conceptLabel: '大胆',
    catalogName: 'Noventure b',
    kind: 'rocky-hot',
    kindLabel: '灼热岩石世界',
    massEarth: 0.75,
    radiusEarth: 0.91,
    semiMajorAxisAu: 0.42,
    eccentricity: 0.03,
    orbitalPeriodDays: 98.44,
    inclinationDeg: 2.1,
    rotationHours: 2362.56,
    obliquityDeg: 0.5,
    bondAlbedo: 0.15,
    equilibriumTemperatureK: 418,
    palette: ['#24110c', '#b8421f', '#ffb053'],
    texturePath: withBase('assets/textures/mars.jpg'),
    initialPhase: 0.7,
    hasAtmosphere: false,
  },
  {
    id: 'haven',
    name: 'Varietas',
    conceptLabel: '多样',
    catalogName: 'Noventure c',
    kind: 'rocky-temperate',
    kindLabel: '温带岩石世界',
    massEarth: 1.18,
    radiusEarth: 1.06,
    semiMajorAxisAu: 1.1,
    eccentricity: 0.025,
    orbitalPeriodDays: 417.24,
    inclinationDeg: 0.7,
    rotationHours: 25.7,
    obliquityDeg: 23,
    bondAlbedo: 0.3,
    equilibriumTemperatureK: 246,
    palette: ['#0a2632', '#287f91', '#b4d7c7'],
    texturePath: withBase('assets/textures/haven-surface-fictional-hd-v1-web.jpg'),
    cloudTexturePath: withBase('assets/textures/earth-clouds.jpg'),
    initialPhase: 2.35,
    hasAtmosphere: true,
  },
  {
    id: 'aurelia',
    name: 'Gravitas',
    conceptLabel: '沉稳',
    catalogName: 'Noventure d',
    kind: 'gas-giant',
    kindLabel: '低密度气态巨行星',
    massEarth: 228.84,
    radiusEarth: 11.43,
    semiMajorAxisAu: 3.3,
    eccentricity: 0.045,
    orbitalPeriodDays: 2167.31,
    inclinationDeg: 1.3,
    rotationHours: 10.4,
    obliquityDeg: 8,
    bondAlbedo: 0.34,
    equilibriumTemperatureK: 140,
    palette: ['#513020', '#c99159', '#ead3a5'],
    texturePath: withBase('assets/textures/jupiter.jpg'),
    initialPhase: 4.1,
    hasAtmosphere: true,
    hasRings: true,
  },
  {
    id: 'pelagos',
    name: 'Ratio',
    conceptLabel: '理性',
    catalogName: 'Noventure e',
    kind: 'ice-giant',
    kindLabel: '高倾角冰巨星',
    massEarth: 15.5,
    radiusEarth: 3.85,
    semiMajorAxisAu: 8.9,
    eccentricity: 0.035,
    orbitalPeriodDays: 9602.24,
    inclinationDeg: 2.4,
    rotationHours: 16.8,
    obliquityDeg: 31,
    bondAlbedo: 0.29,
    equilibriumTemperatureK: 87,
    palette: ['#06164f', '#174bc1', '#91b9ff'],
    texturePath: withBase('assets/textures/ratio-climate-hd-v1-web.jpg'),
    initialPhase: 5.45,
    hasAtmosphere: true,
  },
];

const minOrbit = Math.min(...planets.map((planet) => planet.semiMajorAxisAu));
const maxOrbit = Math.max(...planets.map((planet) => planet.semiMajorAxisAu));

export function mapOrbitRadius(semiMajorAxisAu: number): number {
  const normalized =
    (Math.log(semiMajorAxisAu) - Math.log(minOrbit)) /
    (Math.log(maxOrbit) - Math.log(minOrbit));
  return 18 + normalized * 54;
}

export function mapPlanetRadius(radiusEarth: number): number {
  return Math.min(6.5, Math.max(1.5, 2.2 * radiusEarth ** 0.52));
}

export function visualOrbitPeriod(periodDays: number): number {
  return Math.min(76, Math.max(24, 32 * (periodDays / 417.24) ** 0.3)) * 5;
}
