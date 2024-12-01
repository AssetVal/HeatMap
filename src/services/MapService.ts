import type L from 'leaflet';
import type { FeatureCollection } from 'geojson';
import type { CountyFeature } from '~/types/map';
import type { Address } from '../types';
import type { MarkerClusterGroup, GeoJSON, MarkerCluster } from 'leaflet';

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

  async addMarkers(addresses: Address[]): Promise<{ failed: Address[] }> {
    const failed: Address[] = [];
    if (!this.markersGroup) return { failed };
    this.markersGroup.clearLayers();

    for (const addr of addresses) {
      const coords = await this.geocode(addr.address);
      if (coords) {
        const marker = this.L!.marker(coords).bindPopup(`
          <div>
            <p><strong>${addr.fields.street}</strong></p>
            <p>${addr.fields.city}, ${addr.fields.state} ${addr.fields.zip}</p>
          </div>
        `);
        this.markersGroup.addLayer(marker);
      } else {
        failed.push(addr);
      }
    }

    if (this.markersGroup.getLayers().length) {
      this.map?.fitBounds(this.markersGroup.getBounds().pad(0.1));
    }

    return { failed };
  }

  private async geocode(address: string): Promise<[number, number] | null> {
    try {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(address)}`,
      );
      const data = await response.json();
      return data?.[0] ? [Number(data[0].lat), Number(data[0].lon)] : null;
    } catch (error) {
      console.error('Geocoding error:', error);
      return null;
    }
  }

  cleanup(): void {
    this.map?.remove();
  }
}
