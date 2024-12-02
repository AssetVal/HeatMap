import { useLocation } from "@solidjs/router";

export default function Nav() {
	const location = useLocation();
	const active = (path: string) =>
		path === location.pathname
			? "border-sky-600"
			: "border-transparent hover:border-sky-600";
	return (
		<nav class="bg-sky-800">
			<ul class="flex items-center justify-between p-3 text-gray-200 w-full">
				<li class={`border-b-2 ${active("/")} mx-1.5 sm:mx-6`}>
					<a href="/">Home</a>
				</li>

				<li class="text-2xl font-thin text-center">Veritas Data</li>

				<div class="w-[43.6px]">&nbsp;</div>
			</ul>
		</nav>
	);
}
