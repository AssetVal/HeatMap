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

async function loadCountyData(): Promise<{
	geojson: FeatureCollection;
	points: [];
}> {
	const response = await fetch("/data/counties-with-population.geojson");
	const data = await response.json();

	// Find min/max density for better normalization
	const densities = data.features
		.map((f: CountyFeature) => f.properties.density)
		.filter((d: number) => d > 0);

	const maxDensity = Math.max(...densities);
	const minDensity = Math.min(...densities);

	// Process the county features for choropleth display
	const features = data.features.map((feature: CountyFeature) => {
		const density = Number(feature.properties.density);
		// Keep the raw density but ensure it's a valid number
		feature.properties.density = Number.isNaN(density) ? 0 : density;
		return feature;
	});

	return {
		geojson: { ...data, features },
		points: [],
	};
}

function formatETA(seconds: number): string {
	if (seconds < 60) {
		return `${Math.ceil(seconds)}s`;
	}
	const minutes = Math.floor(seconds / 60);
	const remainingSeconds = Math.ceil(seconds % 60);
	return `${minutes}m ${remainingSeconds}s`;
}

function getColor(density: number): string {
	return density > 500
		? "#800026"
		: // Dark red
			density > 200
			? "#BD0026"
			: // Red
				density > 100
				? "#E31A1C"
				: // Bright red
					density > 50
					? "#FC4E2A"
					: // Orange-red
						density > 20
						? "#FD8D3C"
						: // Orange
							density > 10
							? "#FEB24C"
							: // Light orange
								"#FED976"; // Light yellow
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
	let countyLayer: L.GeoJSON | undefined;
	// biome-ignore lint/suspicious/noExplicitAny: <Needed for structure>
	let L: any;

	// Initialize map after component mounts
	onMount(async () => {
		if (typeof window === "undefined") return;
		setIsClient(true);

		try {
			const { geojson } = await loadCountyData();

			const leaflet = await import("leaflet");
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

				// Add county choropleth layer
				countyLayer = L.geoJSON(geojson, {
					style: (feature) => {
						const density = feature?.properties?.density || 0;
						return {
							fillColor: getColor(density),
							weight: 1,
							opacity: 1,
							color: "white",
							fillOpacity: 0.7,
						};
					},
					onEachFeature: (feature, layer) => {
						layer.bindPopup(`
              <div>
                <strong>${feature.properties.NAME}</strong><br/>
                Population: ${feature.properties.population.toLocaleString()}<br/>
                Density: ${feature.properties.density.toFixed(2)} people/km²
              </div>
            `);
					},
				}).addTo(map);

				// Legend for county density
				const legend = L.control({ position: "bottomright" });
				legend.onAdd = () => {
					const div = L.DomUtil.create("div", "info legend");
					const grades = [0, 10, 20, 50, 100, 200, 500];

					div.style.backgroundColor = "white";
					div.style.padding = "6px 8px";
					div.style.border = "1px solid #ccc";
					div.style.borderRadius = "4px";

					let labels = [
						"<strong>Population Density</strong><br>(people/km²)<br>",
					];

					for (let i = 0; i < grades.length; i++) {
						const from = grades[i];
						const to = grades[i + 1];

						labels.push(
							'<i style="background:' +
								getColor(from + 1) +
								'; width: 18px; height: 18px; float: left; margin-right: 8px; opacity: 0.7"></i> ' +
								from +
								(to ? "&ndash;" + to : "+"),
						);
					}

					div.innerHTML = labels.join("<br>");
					return div;
				};
				legend.addTo(map);

				// Initialize marker cluster group for addresses
				markersGroup = L.markerClusterGroup({
					showCoverageOnHover: false,
					maxClusterRadius: 50,
					spiderfyOnMaxZoom: true,
					disableClusteringAtZoom: 16,
					iconCreateFunction: (cluster) => {
						const count = cluster.getChildCount();
						return L.divIcon({
							html: `<div class="cluster-marker">${count}</div>`,
							className: "marker-cluster",
							iconSize: L.point(40, 40),
						});
					},
				}).addTo(map);
			});
		} catch (error) {
			console.error("Error loading county data:", error);
		}
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
