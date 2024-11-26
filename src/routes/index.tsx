import { createSignal } from "solid-js";
import { FileUpload } from "../components/FileUpload";
import { AddressMap } from "../components/AddressMap";
import type { Address } from "../types";

export default function Home() {
	const [addresses, setAddresses] = createSignal<Address[]>([]);

	return (
		<main class="flex flex-col h-[calc(100vh-4rem)]">
			<FileUpload onAddresses={setAddresses} />
			<div class="flex-1">
				<AddressMap addresses={addresses()} />
			</div>
		</main>
	);
}
