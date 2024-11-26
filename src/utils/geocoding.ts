interface GeocodingResult {
	lat: number;
	lng: number;
}

const CACHE_KEY = "geocache";
let geocodeCache: Record<string, GeocodingResult> = {};

try {
	const cached = localStorage.getItem(CACHE_KEY);
	if (cached) {
		geocodeCache = JSON.parse(cached);
	}
} catch (e) {
	console.warn("Failed to load geocode cache");
}

export async function geocodeAddress(
	address: string,
): Promise<GeocodingResult | null> {
	if (geocodeCache[address]) {
		return geocodeCache[address];
	}

	try {
		const response = await fetch(
			`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(
				address,
			)}`,
		);
		const data = await response.json();

		if (data?.[0]) {
			const result = {
				lat: Number.parseFloat(data[0].lat),
				lng: Number.parseFloat(data[0].lon),
			};

			geocodeCache[address] = result;
			try {
				localStorage.setItem(CACHE_KEY, JSON.stringify(geocodeCache));
			} catch (e) {
				console.warn("Failed to save to geocode cache");
			}

			return result;
		}
	} catch (error) {
		console.error("Geocoding error:", error);
	}

	return null;
}
