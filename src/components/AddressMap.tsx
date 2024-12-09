import consola from 'consola';
import 'leaflet.markercluster/dist/MarkerCluster.css';
import 'leaflet.markercluster/dist/MarkerCluster.Default.css';
import {
  createEffect,
  createSignal,
  For,
  onCleanup,
  onMount,
  Show,
} from 'solid-js';
import { useToast } from '~/hooks/useToast';
import { MapService } from '~/services/MapService';
import { useMapStore } from '~/stores/mapStore';
import type { Address } from '~/types';
import type { CountyFeature } from '~/types/map';
import { SearchBox } from './SearchBox';
import { SlidePanel } from './SlidePanel';

interface Props {
  addresses: Address[];
  isSharedMap?: boolean;
}

const copyToClipboard = async (text: string) => {
  try {
    // Modern API attempt
    await navigator.clipboard.writeText(text);
    return true;
  } catch (err) {
    // Fallback method
    consola.info('Clipboard copy failed:', err);
    try {
      const textArea = document.createElement('textarea');
      textArea.value = text;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      return true;
    } catch (fallbackErr) {
      consola.error('Clipboard copy failed:', fallbackErr);
      return false;
    }
  }
};

const checkClipboardPermission = async () => {
  try {
    const result = await navigator.permissions.query({
      name: 'clipboard-write' as PermissionName,
    });
    return result.state === 'granted';
  } catch {
    return false;
  }
};

export function AddressMap(props: Props) {
  const { state, actions } = useMapStore();
  const toast = useToast();
  const [isClient, setIsClient] = createSignal(false);
  const [isPanelOpen, setIsPanelOpen] = createSignal(false);
  const [isMapReady, setIsMapReady] = createSignal(false);
  const [shareUrl, setShareUrl] = createSignal('');

  const [counties, setCounties] = createSignal<CountyFeature[]>([]);
  let highlightedLayer: L.Layer | null = null;

  let mapContainer: HTMLDivElement | undefined;
  let mapService: MapService;

  const handleShare = async () => {
    try {
      // Show the User that we are generating the link
      toast.info({ message: 'Generating shareable link...', timeout: 2000 });

      // Save the heatmap
      const id = await MapService.saveHeatMap(state.processedAddresses);
      if (!id) {
        throw new Error('Failed to save heatmap, please contact AssetVal I.T.');
      }

      const url = `${window.location.origin}/map/${id}`;
      setShareUrl(url);
      actions.setShareResult(id);

      const hasPermission = await checkClipboardPermission();
      if (!hasPermission) {
        actions.setShareResult(id, 'Clipboard permission needed');
        toast.info({
          message:
            'Please allow clipboard access to copy the link automatically',
          timeout: 5000,
        });
        return;
      }

      const copied = await copyToClipboard(url);
      actions.setShareResult(id, copied ? '' : 'Failed to copy to clipboard');

      if (copied) {
        toast.success({
          message: 'Map link copied to clipboard!',
          timeout: 3000,
        });
      } else {
        toast.warning({
          message: 'Link generated but copy failed. Click to copy manually.',
          timeout: 5000,
        });
      }
    } catch (error) {
      console.error('Error sharing map:', error);
      const errorMessage =
        error instanceof Error ? error.message : 'Failed to share map';
      toast.error({ message: errorMessage });
      actions.setShareResult('', errorMessage);
    }
  };

  onMount(async () => {
    if (typeof window === 'undefined') return;

    try {
      await new Promise((resolve) => setTimeout(resolve, 0));
      setIsClient(true);

      if (!mapContainer) {
        throw new Error('Map container not found');
      }

      mapService = new MapService(mapContainer);
      await mapService.initialize();
      await mapService.loadCountyData();

      const { geojson } = await mapService.fetchCountyData();
      setCounties(geojson.features as CountyFeature[]);

      setIsMapReady(true);
    } catch (error) {
      console.error('Error initializing map:', error);
    }
  });

  createEffect(async () => {
    const addresses = props.addresses;
    const ready = isMapReady();

    if (!ready || !mapService || !addresses.length) {
      return;
    }

    if (!mapService || !addresses.length) {
      console.log('Skipping marker addition - no map service or addresses');
      return;
    }

    actions.startProcessing(addresses.length);

    try {
      const { failed } = await mapService.addMarkers(addresses, (current) => {
        actions.updateProgress(current);
      });

      actions.setFailed(failed);
      actions.finishProcessing(true);

      if (failed.length > 0) {
        toast.error({
          message: `Failed to geocode ${failed.length} addresses`,
          timeout: 5000,
        });
      } else {
        toast.success({ message: 'All addresses mapped successfully!' });
      }
    } catch (error) {
      console.error('Error during marker addition:', error);
      actions.finishProcessing(false);

      toast.error({
        message: 'Error adding markers to map',
        timeout: 5000,
      });
    }
  });

  onCleanup(() => {
    mapService?.cleanup();
    actions.reset();
  });

  return (
    <div class="relative w-full h-full min-h-[500px]">
      <Show when={isClient()}>
        <div
          ref={mapContainer}
          class="absolute inset-0 z-0"
          style={{
            'min-height': '500px',
            height: '100%',
            width: '100%',
          }}
        />
      </Show>

      <Show when={state.isLoading}>
        <div class="absolute top-4 right-4 bg-white px-4 py-2 rounded shadow z-[1000]">
          <div class="mb-2 text-gray-900">
            Processing addresses: {state.progress}/{state.total}
            <span class="text-sm text-gray-500 ml-2">ETA: {state.eta}</span>
          </div>
          <div class="w-full bg-gray-200 rounded-full h-2.5">
            <div
              class="bg-sky-600 h-2.5 rounded-full transition-all duration-300"
              style={{ width: `${(state.progress / state.total) * 100}%` }}
            />
          </div>
        </div>
      </Show>

      {/* Search box */}
      <SearchBox
        counties={counties()}
        onSelect={(coords, zoom) => {
          if (!mapService?.map) return;
          mapService.map.setView(coords, zoom);
        }}
        onHighlight={(feature) => {
          if (!mapService?.countyLayer) return;

          // Reset previous highlight
          if (highlightedLayer) {
            (highlightedLayer as L.Path).setStyle({ weight: 1 });
          }

          if (feature) {
            const layers = mapService.countyLayer.getLayers() as L.Layer[];
            const layer = layers.find((l) => {
              const layerFeature = (l as any).feature;
              return (
                layerFeature?.properties?.NAME === feature.properties.NAME &&
                layerFeature?.properties?.STATEFP === feature.properties.STATEFP
              ); // Also match state to ensure uniqueness
            }) as L.Path;

            if (layer) {
              layer.setStyle({ weight: 3 });
              highlightedLayer = layer;
              // Create popup content with the correct feature's data
              const density = feature.properties.density;
              const densityInCurrentUnit = mapService.mapStore.state.useMiles
                ? density * 2.59
                : density;

              const popupContent = `
                <div>
                  <strong>${feature.properties.NAME}</strong><br/>
                  Population: ${feature.properties.population.toLocaleString()}<br/>
                  Density: ${densityInCurrentUnit.toFixed(2)} people/${
                    mapService.mapStore.state.useMiles ? 'mi²' : 'km²'
                  }
                </div>
              `;

              if ('bindPopup' in layer) {
                (layer as L.Layer & { bindPopup: (content: string) => L.Layer })
                  .bindPopup(popupContent)
                  .openPopup();
              }
            }
          }
        }}
      />

      {/* Add unit toggle */}
      <div class="absolute bottom-4 left-4 px-4 py-2 rounded">
        <button
          onClick={() => {
            actions.toggleUnit();
            mapService?.loadCountyData();
            toast.info({
              message: `Switched to ${state.useMiles ? 'miles' : 'kilometers'}`,
              timeout: 2000,
            });
          }}
          class="flex items-center space-x-2 px-4 py-2 bg-sky-600 text-white rounded hover:bg-sky-700"
        >
          <span>Show in {state.useMiles ? 'km²' : 'mi²'}</span>
        </button>
      </div>

      {/* Share map button */}
      <Show when={!state.isLoading && state.isSuccess && !props.isSharedMap}>
        <div class="absolute top-4 right-4 px-4 py-2 rounded bg-white shadow-md">
          {/* Hide the shade button if we've already shared it */}
          <Show when={!state.shareId}>
            <button
              onClick={handleShare}
              class="flex items-center justify-center space-x-2 px-4 py-2 text-center bg-sky-600 text-white rounded hover:bg-sky-700 w-full"
            >
              <span>Share Map</span>
            </button>
          </Show>

          <Show when={state.shareId && !state.shareError}>
            <div class="mt-3 p-2 bg-gray-50 rounded border border-gray-200 flex items-center gap-2">
              <div class="flex-1 truncate text-sm font-mono text-gray-900">
                {shareUrl()}
              </div>
              <button
                onClick={async () => {
                  const copied = await copyToClipboard(shareUrl());
                  if (copied) {
                    toast.success({ message: 'Link copied!', timeout: 2000 });
                  } else {
                    toast.error({ message: 'Failed to copy' });
                  }
                }}
                class="p-1 hover:bg-gray-200 rounded"
                title="Copy link"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  class="h-4 w-4 text-gray-600"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                >
                  <path d="M8 3a1 1 0 011-1h2a1 1 0 110 2H9a1 1 0 01-1-1z" />
                  <path d="M6 3a2 2 0 00-2 2v11a2 2 0 002 2h8a2 2 0 002-2V5a2 2 0 00-2-2 3 3 0 01-3 3H9a3 3 0 01-3-3z" />
                </svg>
              </button>
            </div>
          </Show>

          <Show when={state.shareError}>
            <p class="text-sm text-red-600 mt-2">{state.shareError}</p>
          </Show>

          <Show when={state.failed > 0}>
            <button
              type="button"
              class="mt-2 text-sm text-red-500 hover:text-red-700"
              onClick={() => setIsPanelOpen(true)}
            >
              Failed to geocode: {state.failed}
            </button>
          </Show>
        </div>
      </Show>

      {/* Failed Geocode Sidebar */}
      <SlidePanel isOpen={isPanelOpen()} onClose={() => setIsPanelOpen(false)}>
        <h2 class="text-xl font-semibold mb-4">Failed Addresses</h2>
        <div class="space-y-4">
          <For each={state.failedAddresses}>
            {(addr) => (
              <div class="p-3 bg-red-50 rounded border border-red-200">
                <p class="font-medium text-gray-900">{addr.fields.street}</p>
                <p class="text-sm text-gray-600">
                  {addr.fields.city}, {addr.fields.state} {addr.fields.zip}
                </p>
                <p class="text-xs text-red-600 mt-1">
                  Error: {(addr as any).error || 'Failed to geocode'}
                </p>
              </div>
            )}
          </For>
        </div>
      </SlidePanel>
    </div>
  );
}
export default AddressMap;
