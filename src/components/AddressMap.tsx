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
import { MapService } from '~/services/MapService';
import type { Address } from '~/types';
import { SlidePanel } from './SlidePanel';
import { useMapStore } from '~/stores/mapStore';

interface Props {
  addresses: Address[];
  isSharedMap?: boolean;
}

const copyToClipboard = async (text: string) => {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (err) {
    console.error('Failed to copy:', err);
    return false;
  }
};

export function AddressMap(props: Props) {
  const { state, actions } = useMapStore();
  const [isClient, setIsClient] = createSignal(false);
  const [isPanelOpen, setIsPanelOpen] = createSignal(false);
  const [isMapReady, setIsMapReady] = createSignal(false);

  let mapContainer: HTMLDivElement | undefined;
  let mapService: MapService;

  const handleShare = async () => {
    try {
      // Use processedAddresses directly from state
      const id = await MapService.saveHeatMap(state.processedAddresses);
      const shareUrl = `${window.location.origin}/map/${id}`;
      const copied = await copyToClipboard(shareUrl);
      actions.setShareResult(id, copied ? '' : 'Failed to copy to clipboard');
    } catch (error) {
      console.error('Error sharing map:', error);
      actions.setShareResult(
        '',
        error instanceof Error ? error.message : 'Failed to share map',
      );
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
    } catch (error) {
      console.error('Error during marker addition:', error);
      actions.finishProcessing(false);
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

      <Show when={!state.isLoading && state.isSuccess && !props.isSharedMap}>
        <div class="absolute top-4 right-4 bg-white px-4 py-2 rounded shadow z-[1000]">
          <button
            onClick={handleShare}
            class="flex items-center space-x-2 px-4 py-2 bg-sky-600 text-white rounded hover:bg-sky-700"
          >
            <span>Share Map</span>
          </button>
          <Show when={state.shareId && !state.shareError}>
            <p class="text-sm text-green-600 mt-2">Link copied to clipboard!</p>
          </Show>
          <Show when={state.shareError}>
            <p class="text-sm text-red-600 mt-2">{state.shareError}</p>
          </Show>
        </div>
      </Show>

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
