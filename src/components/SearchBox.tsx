import { USStateConverter } from '@assetval/state-switcher';
import ZipMonster from '@simplisticated/zip-monster';
import { debounce } from '@solid-primitives/scheduled';
import { centroid } from '@turf/turf';
import consola from 'consola';
import { Component, createSignal, Show, onMount, onCleanup } from 'solid-js';
import { useToast } from '../hooks/useToast';
import { AddressValidationService } from '../services/GeocodingService';
import type { CountyFeature } from '../types/map';
import { VirtualList } from './VirtualList';

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

interface SearchResults {
  type: 'county' | 'zip' | 'address';
  text: string;
  feature?: CountyFeature;
  coords: [number, number];
}

// Update HistoryEntry interface to store the full result
interface HistoryEntry {
  display: string;
  type: SearchResults['type'];
  result: SearchResults; // Store the complete result object
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

const getStoredHistory = () => {
  if (typeof window === 'undefined') return [];
  try {
    return JSON.parse(localStorage.getItem('searchHistory') || '[]');
  } catch {
    return [];
  }
};

export const SearchBox: Component<Props> = (props) => {
  const toast = useToast();
  const [query, setQuery] = createSignal('');
  const [results, setResults] = createSignal<SearchResults[]>([]);
  const [isLoading, setIsLoading] = createSignal(false);
  const [selectedIndex, setSelectedIndex] = createSignal(-1);
  const [showHistory, setShowHistory] = createSignal(false);
  const [, setIsClient] = createSignal(false);

  const [searchHistory, setSearchHistory] = createSignal<HistoryEntry[]>([]);

  // Update saveToHistory to store the full result
  const saveToHistory = (result: SearchResults) => {
    if (typeof window === 'undefined') return;

    try {
      const history = [
        {
          display: result.text,
          type: result.type,
          result, // Store the complete result
        },
        ...searchHistory().filter((h) => h.display !== result.text),
      ].slice(0, 5);

      setSearchHistory(history);
      localStorage.setItem('searchHistory', JSON.stringify(history));
    } catch (error) {
      console.warn('Failed to save search history:', error);
    }
  };

  const clearStoredHistory = () => {
    if (typeof window === 'undefined') return;

    try {
      setSearchHistory([]);
      localStorage.removeItem('searchHistory');
    } catch (error) {
      console.warn('Failed to clear search history:', error);
    }
  };

  // Initialize history after mount
  onMount(() => {
    setIsClient(true);
    setSearchHistory(getStoredHistory());
  });

  onCleanup(() => {
    clearStoredHistory();
  });

  const handleSelect = (result: SearchResults) => {
    props.onSelect(result.coords, ZOOM_LEVELS[result.type]);
    if (result.feature) {
      props.onHighlight?.(result.feature);
    }
    saveToHistory(result);
    setResults([]);
    setQuery('');
    setSelectedIndex(-1);
  };

  const handleNewSearch = (result: SearchResults) => {
    props.onSelect(result.coords, ZOOM_LEVELS[result.type]);
    if (result.feature) {
      props.onHighlight?.(result.feature);
    }
    saveToHistory(result);
    setResults([]);
    setQuery('');
    setSelectedIndex(-1);
  };

  const handleHistorySelect = (result: SearchResults) => {
    props.onSelect(result.coords, ZOOM_LEVELS[result.type]);
    if (result.feature) {
      props.onHighlight?.(result.feature);
    }
    setResults([]);
    setQuery('');
    setSelectedIndex(-1);
  };

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
          const center = centroid(county.geometry);
          return {
            type: 'county' as const,
            text: `${county.properties.NAME} County, ${USStateConverter.convert(county.properties.STATE_NAME)}`,
            feature: county,
            coords: [
              center.geometry.coordinates[1],
              center.geometry.coordinates[0],
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
        <div class="relative flex items-center">
          <input
            type="text"
            placeholder="Search by county or ZIP..."
            value={query()}
            onFocus={() => setShowHistory(true)}
            onBlur={() => setTimeout(() => setShowHistory(false), 200)}
            onInput={(e) => {
              const value = e.currentTarget.value;
              setQuery(value);
              setSelectedIndex(-1);
              if (value.length > 2) {
                setIsLoading(true);
                debouncedSearch(value);
              } else {
                setResults([]);
              }
            }}
            onKeyDown={(e) => {
              const items =
                showHistory() && !results().length
                  ? searchHistory()
                  : results();

              switch (e.key) {
                case 'ArrowDown':
                  e.preventDefault();
                  setSelectedIndex((i) => Math.min(i + 1, items.length - 1));
                  break;
                case 'ArrowUp':
                  e.preventDefault();
                  setSelectedIndex((i) => Math.max(i - 1, -1));
                  break;
                case 'Enter':
                  if (selectedIndex() >= 0) {
                    const selected = items[selectedIndex()];
                    if (typeof selected === 'string') {
                      setQuery(selected);
                      debouncedSearch(selected);
                    } else if ('result' in selected) {
                      handleSelect(selected.result);
                    } else {
                      handleSelect(selected);
                    }
                  }
                  break;
              }
            }}
            class="w-full px-4 py-2 bg-white text-gray-900 rounded shadow-md border border-gray-200"
          />
          <Show when={query()}>
            <button
              class="absolute right-3 text-gray-400 hover:text-gray-600"
              onClick={() => {
                setQuery('');
                setResults([]);
              }}
            >
              ×
            </button>
          </Show>
        </div>

        <Show when={isLoading()}>
          <div class="absolute right-3 top-3">
            <div class="animate-spin h-4 w-4 border-2 border-sky-600 border-r-transparent rounded-full" />
          </div>
        </Show>

        <Show
          when={showHistory() && !results().length && searchHistory().length}
        >
          <div class="absolute mt-1 w-full bg-white rounded shadow-lg border border-gray-200 overflow-hidden">
            <div class="px-4 py-2 bg-gray-50 border-b border-gray-200 flex justify-between items-center">
              <span class="text-sm font-medium text-gray-600">
                Recent Searches
              </span>
              <button
                onClick={(e) => {
                  e.preventDefault(); // Prevent focus loss
                  clearStoredHistory();
                  setShowHistory(false);
                }}
                class="text-gray-400 hover:text-gray-600 p-1 rounded hover:bg-gray-100 transition-colors"
                title="Clear history"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  class="h-4 w-4"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                >
                  <path
                    fill-rule="evenodd"
                    d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                    clip-rule="evenodd"
                  />
                </svg>
              </button>
            </div>
            <VirtualList
              items={searchHistory()}
              itemHeight={40}
              height={`${Math.min(searchHistory().length * 40, 240)}px`}
              renderItem={(historyEntry, index) => (
                <button
                  class={`w-full h-full px-4 py-2 text-left flex items-center gap-2 group ${
                    index === selectedIndex()
                      ? 'bg-gray-100'
                      : 'hover:bg-gray-50'
                  }`}
                  onClick={() => handleHistorySelect(historyEntry.result)}
                >
                  <span class="flex-1 truncate">{historyEntry.display}</span>
                  <div class="flex items-center gap-2 text-gray-400 group-hover:text-gray-600">
                    <span class="text-xs capitalize">{historyEntry.type}</span>
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      class="h-4 w-4"
                      viewBox="0 0 20 20"
                      fill="currentColor"
                    >
                      <path
                        fill-rule="evenodd"
                        d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z"
                        clip-rule="evenodd"
                      />
                    </svg>
                  </div>
                </button>
              )}
            />
          </div>
        </Show>

        <Show when={results().length > 0}>
          <VirtualList
            items={results()}
            itemHeight={40}
            height={`${Math.min(results().length * 40, 240)}px`}
            renderItem={(result, index) => (
              <button
                class={`w-full h-full px-4 py-2 text-left flex items-center gap-2 ${
                  index === selectedIndex() ? 'bg-gray-100' : 'hover:bg-gray-50'
                }`}
                onClick={() => handleNewSearch(result)}
              >
                <span class="flex-1 truncate">{result.text}</span>
                <span class="text-xs text-gray-500 capitalize flex-shrink-0">
                  {result.type}
                </span>
              </button>
            )}
          />
        </Show>
      </div>
    </div>
  );
};
