import { useParams } from '@solidjs/router';
import { createEffect, createResource, createSignal, Show } from 'solid-js';
import { NoHydration } from 'solid-js/web';
import { AddressMap } from '~/components/AddressMap';
import { ErrorBoundary } from '~/components/ErrorBoundary';
import { MapService } from '~/services/MapService';
import { useMapStore } from '~/stores/mapStore';
import type { Address } from '~/types';

async function loadHeatmapData(id: string): Promise<Address[]> {
  if (!id) {
    throw new Error('No map ID provided');
  }

  try {
    const { addresses } = await MapService.loadHeatMap(id);

    if (!addresses?.length) {
      throw new Error('No addresses found in map data');
    }

    if (
      addresses.some(
        (addr) =>
          !addr.geocode || !addr.geocode.latitude || !addr.geocode.longitude,
      )
    ) {
      throw new Error('Invalid address data in map');
    }

    // Transform the heatmap data into Address format
    return addresses.map((addr) => ({
      fields: {
        street: addr.street,
        city: addr.city,
        state: addr.state,
        zip: addr.zip,
      },
      // Include coordinates if they exist
      lat: addr.geocode?.latitude,
      lng: addr.geocode?.longitude,
      address: `${addr.street}, ${addr.city}, ${addr.state} ${addr.zip}`,
    }));
  } catch (error) {
    console.error('Failed to load heatmap:', error);
    throw new Error(
      error instanceof Error
        ? error.message
        : 'Failed to load map data. Please try again.',
    );
  }
}

export default function SharedMap() {
  const params = useParams();
  const [isClient, setIsClient] = createSignal(false);
  const [addresses, { refetch }] = createResource(
    () => (isClient() ? params.id : null),
    loadHeatmapData,
  );
  const { actions } = useMapStore();

  createEffect(() => {
    if (typeof window !== 'undefined') {
      setIsClient(true);
    }
    if (addresses() && !addresses.error) {
      actions.setAddresses(addresses()!);
    }
  });

  return (
    <ErrorBoundary>
      <main class="flex flex-col h-[calc(100dvh)]">
        <Show
          when={isClient()}
          fallback={
            <NoHydration>
              <div class="p-4 text-center">
                <div class="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-sky-600 border-r-transparent"></div>
                <p class="mt-2 text-gray-600">Initializing map...</p>
              </div>
            </NoHydration>
          }
        >
          <Show
            when={!addresses.error}
            fallback={
              <div class="p-4 text-center">
                <div class="bg-red-50 border border-red-200 rounded-lg p-6 max-w-2xl mx-auto">
                  <h2 class="text-xl font-semibold text-red-700 mb-4">
                    Failed to load map data
                  </h2>
                  <pre class="bg-white rounded p-4 mb-4 text-sm text-red-600 whitespace-pre-wrap">
                    {addresses.error instanceof Error
                      ? addresses.error.message
                      : 'The link may be invalid or expired'}
                  </pre>
                  <button
                    onClick={() => refetch()}
                    class="w-full bg-red-600 hover:bg-red-700 text-white py-2 px-4 rounded"
                  >
                    Retry Loading
                  </button>
                </div>
              </div>
            }
          >
            <Show
              when={!addresses.loading}
              fallback={
                <div class="p-4 text-center">
                  <div class="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-sky-600 border-r-transparent"></div>
                  <p class="mt-2 text-gray-600">Loading map data...</p>
                </div>
              }
            >
              <div class="flex-1">
                <AddressMap addresses={addresses() || []} isSharedMap={true} />
              </div>
            </Show>
          </Show>
        </Show>
      </main>
    </ErrorBoundary>
  );
}
