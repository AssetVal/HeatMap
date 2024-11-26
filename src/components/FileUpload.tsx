import { read, utils } from "xlsx";
import type { Address } from "../types";

interface Props {
	onAddresses: (addresses: Address[]) => void;
}

export function FileUpload(props: Props) {
	const handleFile = async (event: Event) => {
		const file = (event.target as HTMLInputElement).files?.[0];
		if (!file) return;

		const buffer = await file.arrayBuffer();
		const workbook = read(buffer);
		const worksheet = workbook.Sheets[workbook.SheetNames[0]];
		const data = utils.sheet_to_json<{ address: string }>(worksheet);

		props.onAddresses(data.map((row) => ({ address: row.address })));
	};

	return (
		<div class="p-4 text-center">
			<input
				type="file"
				accept=".xlsx,.xls,.csv"
				onChange={handleFile}
				class="border border-gray-300 p-2 rounded"
			/>
		</div>
	);
}
