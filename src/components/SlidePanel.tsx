import { Show, type JSX } from "solid-js";

interface SlidePanelProps {
	isOpen: boolean;
	onClose: () => void;
	children: JSX.Element | JSX.Element[];
}

export function SlidePanel(props: SlidePanelProps) {
	return (
		<Show when={props.isOpen}>
			<div
				class="fixed inset-0 bg-black bg-opacity-50 z-[1001]"
				onClick={props.onClose}
				onKeyDown={(e) => e.key === "Escape" && props.onClose()}
			>
				<div
					class="absolute right-0 top-0 h-full w-96 bg-white shadow-lg transform transition-transform duration-300"
					onClick={(e) => e.stopPropagation()}
					onKeyDown={(e) => e.stopPropagation()}
				>
					<div class="p-4">
						<button
							type="button"
							onClick={props.onClose}
							class="absolute top-4 right-4 text-gray-500 hover:text-gray-700"
						>
							✕
						</button>
						{props.children}
					</div>
				</div>
			</div>
		</Show>
	);
}
