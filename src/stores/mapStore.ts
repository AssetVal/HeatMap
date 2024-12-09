import { createStore } from 'solid-js/store';
import type { Address, AddressFields } from '~/types';

interface MapState {
  useMiles: boolean;
  isLoading: boolean;
  progress: number;
  total: number;
  failed: number;
  failedAddresses: Address[];
  eta: string;
  startTime: number;
  shareId: string;
  isSuccess: boolean;
  shareError: string;
  addresses: Address[];
  geocodedAddresses: Map<string, { lat: number; lng: number }>;
  processedAddresses: Array<
    AddressFields & { geocode?: { latitude: number; longitude: number, countyDensity?: number } }
  >;
}

const [state, setState] = createStore<MapState>({
  useMiles: true,
  isLoading: false,
  progress: 0,
  total: 0,
  failed: 0,
  failedAddresses: [],
  eta: '',
  startTime: 0,
  shareId: '',
  isSuccess: false,
  shareError: '',
  addresses: [],
  geocodedAddresses: new Map(),
  processedAddresses: [],
});

export function useMapStore() {
  const actions = {
    setAddresses(addresses: Address[]) {
      setState('addresses', addresses);
      // Initialize processedAddresses with any existing geocoded addresses
      setState(
        'processedAddresses',
        addresses
          .filter((addr) => addr.lat && addr.lng)
          .map((addr) => ({
            street: addr.fields.street,
            city: addr.fields.city,
            state: addr.fields.state,
            zip: addr.fields.zip,
            geocode: {
              latitude: addr.lat!,
              longitude: addr.lng!,
            },
            countyDensity: addr.countyDensity,
          })),
      );
      // Initialize geocodedAddresses map
      const geocoded = new Map();
      addresses.forEach((addr) => {
        if (addr.lat && addr.lng) {
          geocoded.set(addressToKey(addr), { lat: addr.lat, lng: addr.lng, countyDensity: addr.countyDensity });
        }
      });
      setState('geocodedAddresses', geocoded);
    },

    startProcessing(total: number) {
      setState({
        isLoading: true,
        progress: 0,
        total,
        failed: 0,
        failedAddresses: [],
        startTime: Date.now(),
        shareId: '',
        isSuccess: false,
        shareError: '',
        processedAddresses: [],
      });
    },

    updateProgress(current: number) {
      setState('progress', current);
      actions.updateETA(current);
    },

    setGeocoded(
      address: Address,
      coords: { lat: number; lng: number; countyDensity?: number },
    ) {
      setState('geocodedAddresses', (map) => {
        const newMap = new Map(map);
        newMap.set(addressToKey(address), coords);
        return newMap;
      });

      // Also update processedAddresses
      setState('processedAddresses', (prev) => [
        ...prev,
        {
          street: address.fields.street,
          city: address.fields.city,
          state: address.fields.state,
          zip: address.fields.zip,
          geocode: {
            latitude: coords.lat,
            longitude: coords.lng,
          },
          countyDensity: coords.countyDensity,
        },
      ]);
    },

    updateETA(current: number) {
      const elapsed = (Date.now() - state.startTime) / 1000;
      const remaining = state.total - current;
      if (current > 0) {
        const avgTime = elapsed / current;
        const eta = Math.ceil(remaining * avgTime);
        setState('eta', formatETA(eta));
      }
    },

    setFailed(addresses: Address[]) {
      setState({
        failedAddresses: addresses,
        failed: addresses.length,
      });
    },

    finishProcessing(success = true) {
      setState({
        isLoading: false,
        isSuccess: success,
      });
    },

    setShareResult(id: string, error?: string) {
      setState({
        shareId: id,
        shareError: error || '',
      });
    },

    reset() {
      setState({
        isLoading: false,
        progress: 0,
        total: 0,
        failed: 0,
        failedAddresses: [],
        eta: '',
        startTime: 0,
        shareId: '',
        isSuccess: false,
        shareError: '',
        addresses: [],
        geocodedAddresses: new Map(),
        processedAddresses: [],
      });
    },

    toggleUnit() {
      setState('useMiles', (prev) => !prev);
    },
  };

  return { state, actions };
}

function addressToKey(address: Address): string {
  return `${address.fields.street}|${address.fields.city}|${address.fields.state}|${address.fields.zip}`;
}

function formatETA(seconds: number): string {
  if (seconds < 60) return `${Math.ceil(seconds)}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.ceil(seconds % 60);
  return `${minutes}m ${remainingSeconds}s`;
}
