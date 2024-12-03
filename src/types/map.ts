// src/types/map.ts
import type { USStateAbbreviations } from '@assetval/state-switcher';
import type { Feature, MultiPolygon, Polygon } from 'geojson';

export interface CountyFeature extends Feature<Polygon | MultiPolygon> {
  properties: {
    density: number;
    population: number;
    NAME: string;
    [key: string]: any;
  };
}

export interface HeatmapData {
  addresses: Array<{
    street: string;
    city: string;
    state: USStateAbbreviations;
    zip: string;
    geocode: { longitude: number; latitude: number };
  }>;
}
