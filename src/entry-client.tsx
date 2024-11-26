// @refresh reload
import { mount, StartClient } from "@solidjs/start/client";

// biome-ignore lint/style/noNonNullAssertion: <This is how solidstart works>
mount(() => <StartClient />, document.getElementById("app")!);
