import { type USStateAbbreviations } from '@assetval/state-switcher';
import type { FeatureCollection } from 'geojson';
import type L from 'leaflet';
import type { GeoJSON, MarkerCluster, MarkerClusterGroup } from 'leaflet';
import type { CountyFeature } from '~/types/map';
import type { Address } from '../types';
import { AddressValidationService } from './GeocodingService';
import consola from 'consola';

export class MapService {
  private map: L.Map | undefined;
  private L: typeof L | undefined; // Will hold Leaflet instance
  private markersGroup: MarkerClusterGroup | undefined;
  private countyLayer: GeoJSON | undefined;

  constructor(private container: HTMLElement) {}

  async initialize(): Promise<void> {
    if (!this.container) {
      console.error('Invalid container element');
      return;
    }

    console.debug('Loading Leaflet...');

    const leaflet = await import('leaflet');
    const _markerCluster = await import('leaflet.markercluster');
    this.L = leaflet.default;

    if (!this.L) {
      console.error('Failed to load Leaflet');
      return;
    } else {
      console.debug('Leaflet loaded');
    }

    this.map = this.L.map(this.container, {
      center: [40, -95],
      zoom: 4,
      minZoom: 2,
    });

    this.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors',
    }).addTo(this.map);

    this.initializeMarkerCluster();

    // Force a resize to ensure proper rendering
    setTimeout(() => {
      this.map?.invalidateSize();
    }, 100);
  }

  private initializeMarkerCluster(): void {
    if (!this.L) return;

    this.markersGroup = this.L.markerClusterGroup({
      showCoverageOnHover: false,
      maxClusterRadius: 50,
      spiderfyOnMaxZoom: true,
      disableClusteringAtZoom: 16,
      iconCreateFunction: (cluster: MarkerCluster) => {
        const count = cluster.getChildCount();
        return this.L!.divIcon({
          html: `<div class="cluster-marker">${count}</div>`,
          className: 'marker-cluster',
          iconSize: this.L!.point(40, 40),
        });
      },
    }).addTo(this.map!);
  }

  async loadCountyData(): Promise<void> {
    const { geojson } = await this.fetchCountyData();
    this.renderCountyLayer(geojson);
    this.addLegend();
  }

  private async fetchCountyData(): Promise<{ geojson: FeatureCollection }> {
    const response = await fetch('/data/counties-with-population.geojson');
    const data = await response.json();
    return { geojson: data };
  }

  private getColor(density: number): string {
    return density > 500
      ? '#800026'
      : // Dark red
        density > 200
        ? '#BD0026'
        : // Red
          density > 100
          ? '#E31A1C'
          : // Bright red
            density > 50
            ? '#FC4E2A'
            : // Orange-red
              density > 20
              ? '#FD8D3C'
              : // Orange
                density > 10
                ? '#FEB24C'
                : // Light orange
                  '#FED976'; // Light yellow
  }

  private renderCountyLayer(geojson: FeatureCollection): void {
    this.countyLayer = this.L!.geoJSON(geojson, {
      style: (feature) => ({
        fillColor: this.getColor(feature?.properties?.density || 0),
        weight: 1,
        opacity: 1,
        color: 'white',
        fillOpacity: 0.7,
      }),
      onEachFeature: (feature: CountyFeature, layer: L.Layer) => {
        layer.bindPopup(`
          <div>
            <strong>${feature.properties.NAME}</strong><br/>
            Population: ${feature.properties.population.toLocaleString()}<br/>
            Density: ${feature.properties.density.toFixed(2)} people/km²
          </div>
        `);
      },
    }).addTo(this.map!);
  }

  private addLegend(): void {
    // @ts-ignore
    const legend = this.L!.control({ position: 'bottomright' });
    legend.onAdd = () => {
      const div = this.L!.DomUtil.create('div', 'info legend');
      const grades = [0, 10, 20, 50, 100, 200, 500];

      div.style.backgroundColor = 'white';
      div.style.padding = '6px 8px';
      div.style.border = '1px solid #ccc';
      div.style.borderRadius = '4px';

      const labels = [
        '<strong>Population Density</strong><br>(people/km²)<br>',
      ];

      for (let i = 0; i < grades.length; i++) {
        const from = grades[i];
        const to = grades[i + 1];
        labels.push(
          `<i style="background:${this.getColor(from + 1)}; width: 18px; height: 18px; 
            float: left; margin-right: 8px; opacity: 0.7"></i> 
            ${from}${to ? `&ndash;${to}` : '+'}`,
        );
      }

      div.innerHTML = labels.join('<br>');
      return div;
    };
    legend.addTo(this.map);
  }

  async addMarkers(
    addresses: Address[],
    onProgress?: (current: number) => void,
  ): Promise<{ failed: Address[] }> {
    console.log('Starting to add markers for addresses:', addresses);
    const failed: Array<Address & { error: string }> = [];
    if (!this.markersGroup) {
      console.warn('No markers group available');
      return { failed };
    }

    this.markersGroup.clearLayers();

    for (const [index, addr] of addresses.entries()) {
      consola.start(`Processing address ${index + 1}:`, addr);
      onProgress?.(index + 1);

      const geocodeAddress = {
        street: addr.fields.street || '',
        city: addr.fields.city || '',
        state: addr.fields.state as USStateAbbreviations,
        zip: addr.fields.zip || '',
      };

      const result = await this.geocode(geocodeAddress);
      if (result.coords) {
        console.log('Successfully geocoded address:', result.coords);
        const marker = this.L!.marker(result.coords).bindPopup(`
        <div>
          <p><strong>${addr.fields.street}</strong></p>
          <p>${addr.fields.city}, ${addr.fields.state} ${addr.fields.zip}</p>
        </div>
      `);
        this.markersGroup!.addLayer(marker);
      } else {
        consola.fail('Failed to geocode address:', addr, result.error);
        failed.push({ ...addr, error: result.error || 'Unknown error' });
      }
    }

    if (this.markersGroup.getLayers().length) {
      console.log('Fitting bounds to markers');
      this.map?.fitBounds(this.markersGroup.getBounds().pad(0.1));
    }

    return { failed };
  }

  private async geocode(address: {
    street: string;
    city: string;
    state: USStateAbbreviations;
    zip: string;
  }): Promise<{ coords: [number, number] | null; error?: string }> {
    try {
      const geocodingService = new AddressValidationService(address);
      const validatedAddress = await geocodingService.exec();
      if (!validatedAddress) {
        consola.warn('Address validation failed:', address);
        return { coords: null, error: 'Address validation failed' };
      }

      const { location } = validatedAddress.geocode;
      if (!location?.latitude || !location?.longitude) {
        consola.warn('Invalid coordinates:', location);
        return {
          coords: null,
          error: 'No coordinates returned from geocoding service',
        };
      }

      return {
        coords: [Number(location.latitude), Number(location.longitude)],
      };
    } catch (error) {
      consola.error('Geocoding error:', error, address);
      return {
        coords: null,
        error:
          error instanceof Error ? error.message : 'Unknown geocoding error',
      };
    }
  }

  cleanup(): void {
    this.map?.remove();
  }
}
