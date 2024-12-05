import { USStateConverter } from '@assetval/state-switcher';
import ZipMonster from '@simplisticated/zip-monster';
import { Component, createSignal, For, Show } from 'solid-js';
import { AddressValidationService } from '~/services/GeocodingService';
import type { CountyFeature } from '~/types/map';
import { useToast } from '~/hooks/useToast';
import consola from 'consola';
import { debounce } from '@solid-primitives/scheduled';
import { centroid } from '@turf/turf';

const ZOOM_LEVELS = {
  county: 6,
  zip: 9,
  address: 12,
} as const;

interface Props {
  counties: CountyFeature[];
  onSelect: (coords: [number, number], zoom: number) => void;
  onHighlight?: (feature?: CountyFeature) => void;
  onShowPopup?: (coords: [number, number]) => void;
}

const parseAddress = (searchQuery: string) => {
  // Basic address parsing - expects format like "123 Main St, City, ST 12345"
  const parts = searchQuery.split(',').map((p) => p.trim());

  if (parts.length >= 3) {
    const street = parts[0];
    const city = parts[1];
    const stateZip = parts[2].split(' ').filter(Boolean);

    // Validate we have enough parts
    if (stateZip.length < 2) {
      return null;
    }

    const stateInput = stateZip[0];
    const zip = stateZip[1];

    if (!street || !city || !stateInput || !zip) return null;
    // Requires number and street name
    if (!/\d+.*\s+.*/.test(street)) return null;
    // Basic ZIP format validation
    if (!/^\d{5}(-\d{4})?$/.test(zip)) {
      return null;
    }
    // City must be at least 2 chars
    if (city.length < 2) {
      return null;
    }

    try {
      // Try to convert state to valid abbreviation
      const state = USStateConverter.convert(stateInput, 'abbr');
      if (!state) return null;

      return {
        street: street
          .replace(/\s+/g, ' ') // Normalize spaces
          .trim(),
        city: city.replace(/\s+/g, ' ').trim(),
        state,
        zip: zip.split('-')[0], // Only keep first part of ZIP if it has extension
      };
    } catch {
      // State conversion failed
      return null;
    }
  }
  return null;
};

export const SearchBox: Component<Props> = (props) => {
  const toast = useToast();
  const [query, setQuery] = createSignal('');
  const [results, setResults] = createSignal<
    Array<{
      type: 'county' | 'zip' | 'address';
      text: string;
      feature?: CountyFeature;
      coords: [number, number];
    }>
  >([]);
  const [isLoading, setIsLoading] = createSignal(false);

  const debouncedSearch = debounce(async (searchQuery: string) => {
    await searchAll(searchQuery);
  }, 600);

  const searchAll = async (searchQuery: string) => {
    setIsLoading(true);
    const results: Array<{
      type: 'county' | 'zip' | 'address';
      text: string;
      feature?: CountyFeature;
      coords: [number, number];
    }> = [];

    try {
      // Search counties
      const countyMatches = props.counties.filter((county) =>
        county.properties.NAME.toLowerCase().includes(
          searchQuery.toLowerCase(),
        ),
      );

      results.push(
        ...countyMatches.map((county) => {
          // Calculate center point of the county geometry
          const center = centroid(county.geometry);
          return {
            type: 'county' as const,
            text: `${county.properties.NAME}`,
            feature: county,
            coords: [
              center.geometry.coordinates[1], // Latitude
              center.geometry.coordinates[0], // Longitude
            ] as [number, number],
          };
        }),
      );

      // Search zip codes
      if (/^\d{5}$/.test(searchQuery)) {
        const zipResults = ZipMonster.find({ zip: searchQuery });
        if (zipResults?.[0]?.location) {
          results.push({
            type: 'zip',
            text: `${searchQuery} (ZIP)`,
            coords: [
              zipResults[0].location.latitude,
              zipResults[0].location.longitude,
            ],
          });
        } else {
          toast.error({ message: `ZIP code ${searchQuery} not found` });
        }
      }

      // Search addresses if it looks like an address
      if (searchQuery.includes(',')) {
        const parsedAddress = parseAddress(searchQuery);
        if (parsedAddress) {
          try {
            const geocodingService = new AddressValidationService({
              ...parsedAddress,
            });

            const result = await geocodingService.exec();
            if (result?.geocode?.location) {
              const validatedAddr = result.validatedAddress;
              results.push({
                type: 'address',
                text: `${validatedAddr.street}, ${validatedAddr.city}, ${validatedAddr.state} ${validatedAddr.zip}`,
                coords: [
                  result.geocode.location.latitude,
                  result.geocode.location.longitude,
                ],
              });

              if (Object.keys(result.suggestions || {}).length > 0) {
                // Show validation feedback if address was corrected
                toast.info({
                  message: 'Address was standardized',
                  timeout: 3000,
                });
              }
            }
          } catch (error) {
            toast.error({
              message:
                error instanceof Error
                  ? error.message
                  : 'Failed to validate address',
              timeout: 5000,
            });
          }
        } else {
          toast.error({
            message:
              'Invalid address format. Use: "123 Main St, City, ST 12345"',
            timeout: 5000,
          });
        }
      }

      if (results.length === 0) {
        toast.info({
          message: 'No matches found',
          timeout: 2000,
        });
      }
    } catch (error) {
      toast.error({
        message: 'Search failed. Please try again.',
        timeout: 3000,
      });
      consola.error('Search failed:', error);
    } finally {
      setIsLoading(false);
    }

    setResults(results);
  };

  return (
    <div class="absolute top-4 left-14 z-[1000] w-72">
      <div class="relative">
        <input
          type="text"
          placeholder="Search by county or ZIP..."
          value={query()}
          onInput={(e) => {
            const value = e.currentTarget.value;
            setQuery(value);
            if (value.length > 2) {
              setIsLoading(true);
              debouncedSearch(value);
            } else {
              setResults([]);
            }
          }}
          class="w-full px-4 py-2 bg-white text-gray-900 rounded shadow-md border border-gray-200"
        />

        <Show when={isLoading()}>
          <div class="absolute right-3 top-3">
            <div class="animate-spin h-4 w-4 border-2 border-sky-600 border-r-transparent rounded-full" />
          </div>
        </Show>

        <Show when={results().length > 0}>
          <div class="absolute mt-1 w-full bg-white text-gray-900 rounded shadow-lg border border-gray-200 max-h-60 overflow-y-auto">
            <For each={results()}>
              {(result) => (
                <button
                  class="w-full px-4 py-2 text-left hover:bg-gray-100 flex items-center gap-2"
                  onClick={() => {
                    props.onSelect(result.coords, ZOOM_LEVELS[result.type]);
                    if (result.feature) {
                      props.onHighlight?.(result.feature);
                      props.onShowPopup?.(result.coords);
                    }
                    setResults([]);
                    setQuery('');
                  }}
                >
                  <span class="flex-1">{result.text}</span>
                  <span class="text-xs text-gray-500 capitalize">
                    {result.type}
                  </span>
                </button>
              )}
            </For>
          </div>
        </Show>
      </div>
    </div>
  );
};
