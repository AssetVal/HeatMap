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
	return response.json();
}

function formatETA(seconds: number): string {
	if (seconds < 60) {
		return `${Math.ceil(seconds)}s`;
	}
	const minutes = Math.floor(seconds / 60);
	const remainingSeconds = Math.ceil(seconds % 60);
	return `${minutes}m ${remainingSeconds}s`;
}

function calculateCentroid(
	coordinates: Position[][] | Position[][][],
): [number, number] {
	let lat = 0;
	let lng = 0;
	let count = 0;

	// Handle both Polygon and MultiPolygon coordinates
	const coords = Array.isArray(coordinates[0][0])
		? (coordinates[0] as Position[]) // Polygon
		: (coordinates[0][0] as Position[]); // MultiPolygon

	for (const coord of coords) {
		lat += coord[1];
		lng += coord[0];
		count++;
	}

	return [lat / count, lng / count];
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
			const points = (countyData.features as CountyFeature[]).map((feature) => {
				const centroid = calculateCentroid(feature.geometry.coordinates);
				const intensity = Math.log(feature.properties.density) / 25;
				return [centroid[0], centroid[1], intensity] as [
					number,
					number,
					number,
				];
			});
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
				blur: 25,
				maxZoom: 10,
				max: 1.0,
				gradient: {
					0.2: "#fee5d9",
					0.4: "#fcae91",
					0.6: "#fb6a4a",
					0.8: "#de2d26",
					1.0: "#a50f15",
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
