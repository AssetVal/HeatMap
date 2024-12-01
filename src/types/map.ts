// src/types/map.ts
import type { Feature, MultiPolygon, Polygon } from "geojson";

export interface CountyFeature extends Feature<Polygon | MultiPolygon> {
	properties: {
		density: number;
		population: number;
		NAME: string;
		[key: string]: any;
	};
}
