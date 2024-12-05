import { type USStateAbbreviations } from '@assetval/state-switcher';
import type { FeatureCollection } from 'geojson';
import type L from 'leaflet';
import type { GeoJSON, MarkerCluster, MarkerClusterGroup } from 'leaflet';
import type { CountyFeature, HeatmapData } from '~/types/map';
import type { Address, AddressFields } from '../types';
import { AddressValidationService } from './GeocodingService';
import consola from 'consola';
import { useMapStore } from '~/stores/mapStore';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

export class MapService {
  public map: L.Map | undefined;
  private L: typeof L | undefined; // Will hold Leaflet instance
  private markersGroup: MarkerClusterGroup | undefined;
  public countyLayer: GeoJSON | undefined;
  private legend: L.Control | undefined;
  public mapStore: ReturnType<typeof useMapStore>;

  constructor(private container: HTMLElement) {
    this.mapStore = useMapStore();
    console.log('MapService initialized with container:', container);
  }

  async initialize(): Promise<void> {
    console.log('Initializing map service...');

    if (!this.container) {
      console.error('Invalid container element');
      return;
    }

    try {
      const leaflet = await import('leaflet');
      await import('leaflet.markercluster');
      this.L = leaflet.default;

      if (!this.L) {
        console.error('Failed to load Leaflet');
        return;
      } else {
        console.debug('Leaflet loaded');
      }

      // Fix marker icon paths for production
      this.L.Icon.Default.imagePath = '/';
      // @ts-ignore
      delete this.L.Icon.Default.prototype._getIconUrl;
      this.L.Icon.Default.mergeOptions({
        iconRetinaUrl: '/marker-icon-2x.png',
        iconUrl: '/marker-icon.png',
        shadowUrl: '/marker-shadow.png',
      });

      this.map = this.L.map(this.container, {
        center: [40, -95],
        zoom: 4,
        minZoom: 2,
      });

      this.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors',
      }).addTo(this.map);

      consola.start('Initializing marker cluster...');
      this.initializeMarkerCluster();
      consola.success('Marker cluster initialized');

      // Force a resize to ensure proper rendering
      setTimeout(() => {
        console.log('Invalidating map size...');
        this.map?.invalidateSize();
      }, 250);

      console.log('Map initialization complete');
    } catch (error) {
      console.error('Error during map initialization:', error);
      throw error;
    }
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

  public async fetchCountyData(): Promise<{ geojson: FeatureCollection }> {
    const response = await fetch('/data/counties-with-population.geojson');
    const data = await response.json();
    return { geojson: data };
  }

  public showPopupAtLocation(feature: CountyFeature): void {
    if (!this.map || !this.countyLayer) return;

    // Find the layer for this feature
    const layer = (this.countyLayer.getLayers() as L.Layer[]).find(
      (l) => (l as any).feature?.properties?.NAME === feature.properties.NAME,
    );

    if (layer && 'openPopup' in layer) {
      (layer as L.Layer & { openPopup: () => void }).openPopup();
    }
  }

  private getColor(density: number): string {
    // Convert to mi² if needed
    const d = this.mapStore.state.useMiles ? density * 2.59 : density;

    // Extended color scale with more granularity
    return d > 1000 * (this.mapStore.state.useMiles ? 2.59 : 1)
      ? '#67000D' // Darkest red
      : d > 500 * (this.mapStore.state.useMiles ? 2.59 : 1)
        ? '#800026'
        : d > 200 * (this.mapStore.state.useMiles ? 2.59 : 1)
          ? '#BD0026'
          : d > 100 * (this.mapStore.state.useMiles ? 2.59 : 1)
            ? '#E31A1C'
            : d > 50 * (this.mapStore.state.useMiles ? 2.59 : 1)
              ? '#FC4E2A'
              : d > 20 * (this.mapStore.state.useMiles ? 2.59 : 1)
                ? '#FD8D3C'
                : d > 10 * (this.mapStore.state.useMiles ? 2.59 : 1)
                  ? '#FEB24C'
                  : d > 5 * (this.mapStore.state.useMiles ? 2.59 : 1)
                    ? '#FED976'
                    : '#FFEDA0'; // Lightest yellow
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
        const density = feature.properties.density;
        const densityInCurrentUnit = this.mapStore.state.useMiles
          ? density * 2.59
          : density;

        layer.bindPopup(`
        <div>
          <strong>${feature.properties.NAME}</strong><br/>
          Population: ${feature.properties.population.toLocaleString()}<br/>
          Density: ${densityInCurrentUnit.toFixed(2)} people/${
            this.mapStore.state.useMiles ? 'mi²' : 'km²'
          }
        </div>
      `);
      },
    }).addTo(this.map!);
  }
  private addLegend(): void {
    // Remove existing legend if it exists
    if (this.legend) {
      this.legend.remove();
    }

    // @ts-ignore
    this.legend = this.L!.control({ position: 'bottomright' });
    const unit = this.mapStore.state.useMiles ? 'mi²' : 'km²';

    this.legend!.onAdd = () => {
      const div = this.L!.DomUtil.create('div', 'info legend');
      const grades = [0, 10, 20, 50, 100, 200, 500].map((g) =>
        this.mapStore.state.useMiles ? g * 2.59 : g,
      );

      div.style.backgroundColor = 'white';
      div.style.padding = '6px 8px';
      div.style.border = '1px solid #ccc';
      div.style.borderRadius = '4px';

      const labels = [
        `<strong>Population Density</strong><br>(people/${unit})<br>`,
      ];

      for (let i = 0; i < grades.length; i++) {
        const from = grades[i];
        const to = grades[i + 1];
        labels.push(
          `<i style="background:${this.getColor(from)}; width: 18px; height: 18px; 
          float: left; margin-right: 8px; opacity: 0.7"></i>
          ${Math.round(from)}${to ? `&ndash;${Math.round(to)}` : '+'}`,
        );
      }

      div.innerHTML = labels.join('<br>');
      return div;
    };
    this.legend!.addTo(this.map!);
  }

  async addMarkers(
    addresses: Address[],
    onProgress?: (current: number) => void,
  ): Promise<{ failed: Address[] }> {
    console.log(`Adding ${addresses.length} markers to map`);
    const failed: Array<Address & { error: string }> = [];

    if (!this.markersGroup) {
      console.error('No markers group available - reinitializing');
      this.initializeMarkerCluster();
      if (!this.markersGroup) {
        return { failed };
      }
    }

    this.markersGroup.clearLayers();
    let successCount = 0;

    for (const [index, addr] of addresses.entries()) {
      onProgress?.(index + 1);

      // Check if address already has coordinates
      if (addr.lat && addr.lng) {
        console.log(`Using existing coordinates for ${addr.fields.street}:`, {
          lat: addr.lat,
          lng: addr.lng,
        });

        try {
          const marker = this.L!.marker([addr.lat, addr.lng]).bindPopup(`
          <div>
            <p><strong>${addr.fields.street}</strong></p>
            <p>${addr.fields.city}, ${addr.fields.state} ${addr.fields.zip}</p>
          </div>
        `);

          this.markersGroup.addLayer(marker);
          this.mapStore.actions.setGeocoded(addr, {
            lat: addr.lat,
            lng: addr.lng,
          });
          successCount++;
          continue;
        } catch (error) {
          console.error('Error adding marker:', error);
          failed.push({ ...addr, error: 'Failed to add marker' });
          continue;
        }
      }

      // Only geocode if coordinates don't exist
      const geocodeAddress = {
        street: addr.fields.street || '',
        city: addr.fields.city || '',
        state: addr.fields.state as USStateAbbreviations,
        zip: addr.fields.zip || '',
      };

      const result = await this.geocode(geocodeAddress);
      if (result.coords) {
        console.log('Successfully geocoded address:', result.coords);
        this.mapStore.actions.setGeocoded(addr, {
          lat: result.coords[0],
          lng: result.coords[1],
        });

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

    console.log(`Successfully added ${successCount} markers`);

    if (this.markersGroup.getLayers().length) {
      console.log('Fitting bounds to markers');
      this.map?.fitBounds(this.markersGroup.getBounds().pad(0.1));
    } else {
      console.warn('No layers in marker group to fit bounds');
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

  static async saveHeatMap(
    addresses: Array<
      AddressFields & { geocode?: { latitude: number; longitude: number } }
    >,
  ): Promise<string> {
    const response = await fetch(`${API_URL}/saveHeatmapData`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        addresses: addresses.filter(
          (addr) => addr.geocode?.latitude && addr.geocode?.longitude,
        ),
      }),
    });

    const data = await response.json();
    if (!data.success) {
      throw new Error(data.message || 'Failed to save heatmap');
    }

    return data.data._id;
  }

  static async loadHeatMap(heatmapID: string): Promise<HeatmapData> {
    const response = await fetch(`${API_URL}/loadHeatmapData`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ heatmapID }),
    });

    const data = await response.json();
    if (!data.data) {
      throw new Error(data.message || 'Failed to load heatmap');
    }

    return data.data;
  }

  cleanup(): void {
    this.map?.remove();
  }
}
