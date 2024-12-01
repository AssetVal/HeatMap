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
import type { Address } from '../types';
import { SlidePanel } from './SlidePanel';

interface Props {
  addresses: Address[];
}

function formatETA(seconds: number): string {
  if (seconds < 60) {
    return `${Math.ceil(seconds)}s`;
  }
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.ceil(seconds % 60);
  return `${minutes}m ${remainingSeconds}s`;
}

export function AddressMap(props: Props) {
  const [isLoading, setIsLoading] = createSignal(false);
  const [isClient, setIsClient] = createSignal(false);
  const [progress, setProgress] = createSignal(0);
  const [failed, setFailed] = createSignal(0);
  const [total, setTotal] = createSignal(0);
  const [isPanelOpen, setIsPanelOpen] = createSignal(false);
  const [failedAddresses, setFailedAddresses] = createSignal<Address[]>([]);
  const [eta, setEta] = createSignal<string>('');

  let mapContainer: HTMLDivElement | undefined;
  let mapService: MapService;

  // Initialize map after component mounts
  onMount(async () => {
    if (typeof window === 'undefined') return;

    try {
      await new Promise((resolve) => setTimeout(resolve, 0)); // Wait for DOM
      setIsClient(true);

      if (!mapContainer) {
        throw new Error('Map container not found');
      }

      mapService = new MapService(mapContainer);
      await mapService.initialize();
      await mapService.loadCountyData();
    } catch (error) {
      console.error('Error initializing map:', error);
    }
  });

  createEffect(async () => {
    if (!mapService || !props.addresses.length) return;

    setIsLoading(true);
    setProgress(0);
    setFailed(0);
    setTotal(props.addresses.length);
    setFailedAddresses([]);
    setEta(formatETA(props.addresses.length));

    const { failed: failedAddrs } = await mapService.addMarkers(
      props.addresses,
    );
    setFailedAddresses(failedAddrs);
    setFailed(failedAddrs.length);
    setIsLoading(false);
  });

  onCleanup(() => {
    mapService?.cleanup();
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
      <Show when={isLoading()}>
        <div class="absolute top-4 right-4 bg-white px-4 py-2 rounded shadow z-[1000]">
          <div class="mb-2">
            Processing addresses: {progress()}/{total()}
            <span class="text-sm text-gray-500 ml-2">ETA: {eta()}</span>
          </div>
          <div class="w-full bg-gray-200 rounded-full h-2.5">
            <div
              class="bg-sky-600 h-2.5 rounded-full transition-all duration-300"
              style={{ width: `${(progress() / total()) * 100}%` }}
            />
          </div>
          <Show when={failed() > 0}>
            <button
              type="button"
              class="mt-2 text-sm text-red-500 hover:text-red-700"
              onClick={() => setIsPanelOpen(true)}
            >
              Failed to geocode: {failed()}
            </button>
          </Show>
        </div>
      </Show>

      <SlidePanel isOpen={isPanelOpen()} onClose={() => setIsPanelOpen(false)}>
        <h2 class="text-xl font-semibold mb-4">Failed Addresses</h2>
        <div class="space-y-4">
          <For each={failedAddresses()}>
            {(addr) => (
              <div class="p-3 bg-red-50 rounded border border-red-200">
                <p class="font-medium text-gray-900">{addr.fields.street}</p>
                <p class="text-sm text-gray-600">
                  {addr.fields.city}, {addr.fields.state} {addr.fields.zip}
                </p>
              </div>
            )}
          </For>
        </div>
      </SlidePanel>
    </div>
  );
}
