import {
	onMount,
	createEffect,
	createSignal,
	onCleanup,
	Show,
	For,
} from "solid-js";
import "leaflet.markercluster/dist/MarkerCluster.css";
import "leaflet.markercluster/dist/MarkerCluster.Default.css";
import type { Address } from "../types";
import { SlidePanel } from "./SlidePanel";
import type {
	Feature,
	FeatureCollection,
	MultiPolygon,
	Polygon,
	Position,
} from "geojson";

interface Props {
	addresses: Address[];
}

interface CountyFeature extends Feature<Polygon | MultiPolygon> {
	properties: {
		density: number;
		population: number;

		// biome-ignore lint/suspicious/noExplicitAny: <explanation>
		[key: string]: any;
	};
}

async function loadCountyData(): Promise<FeatureCollection> {
	const response = await fetch("/data/counties-with-population.geojson");
	const data = await response.json();

	// Validate and normalize density values
	data.features = data.features.map(
		(feature: { properties: { density: number } }) => {
			const density = Number(feature.properties.density);
			feature.properties.density = Number.isNaN(density)
				? 0
				: Math.max(0, Math.min(density, 1000000));
			return feature;
		},
	);

	return data;
}

function formatETA(seconds: number): string {
	if (seconds < 60) {
		return `${Math.ceil(seconds)}s`;
	}
	const minutes = Math.floor(seconds / 60);
	const remainingSeconds = Math.ceil(seconds % 60);
	return `${minutes}m ${remainingSeconds}s`;
}

// biome-ignore lint/suspicious/noExplicitAny: <explanation>
function calculateCentroid(geometry: any): [number, number] {
	try {
		// Handle different geometry types
		const coordinates =
			geometry.type === "MultiPolygon"
				? geometry.coordinates[0][0] // First polygon of multipolygon
				: geometry.coordinates[0]; // First ring of polygon

		let sumLat = 0;
		let sumLng = 0;
		let count = 0;

		// Process each coordinate pair
		for (const coord of coordinates) {
			// GeoJSON coordinates are [longitude, latitude]
			const lng = Number(coord[0]);
			const lat = Number(coord[1]);

			if (!Number.isNaN(lat) && !Number.isNaN(lng)) {
				sumLat += lat;
				sumLng += lng;
				count++;
			}
		}

		if (count === 0) {
			console.warn("No valid coordinates found");
			return [0, 0];
		}

		return [sumLat / count, sumLng / count];
	} catch (error) {
		console.error("Error calculating centroid:", error);
		return [0, 0];
	}
}

export function AddressMap(props: Props) {
	const [isLoading, setIsLoading] = createSignal(false);
	const [isClient, setIsClient] = createSignal(false);
	const [progress, setProgress] = createSignal(0);
	const [failed, setFailed] = createSignal(0);
	const [total, setTotal] = createSignal(0);
	const [isPanelOpen, setIsPanelOpen] = createSignal(false);
	const [failedAddresses, setFailedAddresses] = createSignal<Address[]>([]);
	const [eta, setEta] = createSignal<string>("");
	const [heatmapPoints, setHeatmapPoints] = createSignal<
		[number, number, number][]
	>([]);

	let mapContainer: HTMLDivElement | undefined;
	let map: L.Map | undefined;
	// biome-ignore lint/suspicious/noExplicitAny: <Needed for structure>
	let heatLayer: any;
	// biome-ignore lint/suspicious/noExplicitAny: <Needed for structure>
	let markersGroup: any;
	// biome-ignore lint/suspicious/noExplicitAny: <Needed for structure>
	let L: any;

	// Initialize map after component mounts
	onMount(async () => {
		if (typeof window === "undefined") return;
		setIsClient(true);

		try {
			const countyData = await loadCountyData();

			// Find max density for normalization
			const densities = countyData.features.map(
				(f) => f.properties?.density || 0,
			);
			const maxDensity = Math.max(...densities);
			const minDensity = Math.min(...densities.filter((d) => d > 0));

			const points = countyData.features
				.map((feature) => {
					const centroid = calculateCentroid(feature.geometry);
					if (centroid[0] === 0 && centroid[1] === 0) return null;

					// Normalize density to 0-1 range using log scale
					const density = feature.properties?.density || 0;
					const intensity =
						density > 0 ? Math.log(density + 1) / Math.log(maxDensity + 1) : 0;

					return [centroid[0], centroid[1], intensity] as [
						number,
						number,
						number,
					];
				})
				.filter((point): point is [number, number, number] => point !== null);

			setHeatmapPoints(points);
		} catch (error) {
			console.error("Error loading county data:", error);
		}

		// Dynamically import Leaflet
		const leaflet = await import("leaflet");
		const leafletHeat = await import("leaflet.heat");
		const markerCluster = await import("leaflet.markercluster");
		L = leaflet.default;

		// Wait for container to be ready
		requestAnimationFrame(() => {
			if (!mapContainer) return;

			map = L.map(mapContainer, {
				center: [40, -95],
				zoom: 4,
				minZoom: 2,
			});

			L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
				attribution: "© OpenStreetMap contributors",
			}).addTo(map);

			heatLayer = L.heatLayer(heatmapPoints(), {
				radius: 35,
				blur: 20,
				maxZoom: 10,
				max: 1.0,

				minOpacity: 0.35,
				gradient: {
					0: "#053061", // Dark blue
					0.2: "#2166ac", // Medium blue
					0.4: "#f7f7f7", // White/yellow transition
					0.6: "#fec44f", // Yellow
					0.8: "#ec7014", // Orange
					1.0: "#a50f15", // Dark red
				},
			}).addTo(map);

			markersGroup = L.markerClusterGroup({
				showCoverageOnHover: false,
				maxClusterRadius: 50,
				spiderfyOnMaxZoom: true,
				disableClusteringAtZoom: 16,
				// biome-ignore lint/suspicious/noExplicitAny: <explanation>
				iconCreateFunction: (cluster: any) => {
					const count = cluster.getChildCount();
					return L.divIcon({
						html: `<div class="cluster-marker">${count}</div>`,
						className: "marker-cluster",
						iconSize: L.point(40, 40),
					});
				},
			}).addTo(map);

			map?.on("zoomend", () => {
				const zoom = map?.getZoom();
				if (!zoom) return;
				const radius = Math.max(5, 25 - zoom); // Adjust radius based on zoom
				const blur = Math.max(4, 20 - zoom); // Adjust blur based on zoom
				heatLayer.setOptions({
					radius: radius,
					blur: blur,
				});
			});

			requestAnimationFrame(() => {
				map?.invalidateSize(true);
			});
		});
	});

	createEffect(async () => {
		console.log("Addresses changed:", props.addresses);
		if (!map || !props.addresses.length || !L) {
			console.log("Map not ready or no addresses");
			return;
		}

		setIsLoading(true);
		setProgress(0);
		setFailed(0);
		setTotal(props.addresses.length);
		setFailedAddresses([]);

		// Calculate initial ETA (1 second per address)
		setEta(formatETA(props.addresses.length));

		const points: [number, number, number][] = [];
		markersGroup?.clearLayers();

		for (const addr of props.addresses) {
			const coords = await geocode(addr.address);
			if (coords) {
				points.push([coords[0], coords[1], 1]);
				const marker = L.marker(coords).bindPopup(`
            <div>
              <p><strong>${addr.fields.street}</strong></p>
              <p>${addr.fields.city}, ${addr.fields.state} ${addr.fields.zip}</p>
            </div>
          `);
				markersGroup?.addLayer(marker);
			} else {
				setFailed((f) => f + 1);
				setFailedAddresses((prev) => [...prev, addr]);
			}
			setProgress((p) => p + 1);
			// Update ETA based on remaining addresses
			const remaining = total() - progress() - 1;
			setEta(formatETA(remaining));
			await new Promise((resolve) => setTimeout(resolve, 1000));
		}

		if (points.length) {
			heatLayer.setLatLngs(points);
			const bounds = L.latLngBounds(points.map((p) => [p[0], p[1]]));
			map.fitBounds(bounds.pad(0.1));
		}
		setIsLoading(false);
	});

	onCleanup(() => {
		map?.remove();
	});

	return (
		<div class="relative w-full h-full min-h-[500px]">
			<Show when={isClient()}>
				<div
					ref={mapContainer}
					class="absolute inset-0 z-0"
					style={{
						"min-height": "500px",
						height: "100%",
						width: "100%",
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

async function geocode(address: string): Promise<[number, number] | null> {
	try {
		const response = await fetch(
			`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(address)}`,
		);
		const data = await response.json();
		if (data?.[0]) {
			return [Number(data[0].lat), Number(data[0].lon)];
		}
		return null;
	} catch (error) {
		console.error("Geocoding error:", error);
		return null;
	}
}
