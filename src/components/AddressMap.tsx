// src/components/AddressMap.tsx
import { onMount, createEffect, createSignal, onCleanup, Show } from "solid-js";
import type { Address } from "../types";

interface Props {
	addresses: Address[];
}

export function AddressMap(props: Props) {
	const [isLoading, setIsLoading] = createSignal(false);
	const [isClient, setIsClient] = createSignal(false);
	let mapContainer: HTMLDivElement | undefined;
	let map: L.Map | undefined;
	// biome-ignore lint/suspicious/noExplicitAny: <Needed for structure>
	let heatLayer: any;
	let markersGroup: L.LayerGroup | undefined;
	// biome-ignore lint/suspicious/noExplicitAny: <Needed for structure>
	let L: any;

	// Initialize map after component mounts
	onMount(async () => {
		if (typeof window === "undefined") return;

		setIsClient(true);
		// Dynamically import Leaflet
		const leaflet = await import("leaflet");
		const leafletHeat = await import("leaflet.heat");
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

			heatLayer = L.heatLayer([], {
				radius: 25,
				blur: 15,
				maxZoom: 10,
				max: 1.0,
			}).addTo(map);

			markersGroup = L.layerGroup().addTo(map);

			requestAnimationFrame(() => {
				map?.invalidateSize(true);
			});
		});
	});

	createEffect(async () => {
		if (!map || !props.addresses.length || !L) return;

		setIsLoading(true);
		const points: [number, number, number][] = [];
		markersGroup?.clearLayers();

		for (const addr of props.addresses) {
			const coords = await geocode(addr.address);
			if (coords) {
				points.push([coords[0], coords[1], 1]);
				L.marker(coords).bindPopup(addr.address).addTo(markersGroup);
			}
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
					Geocoding addresses...
				</div>
			</Show>
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
