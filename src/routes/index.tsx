import { createSignal, lazy, Suspense } from 'solid-js';
import type { Address } from '../types';
import { Circles } from 'solid-spinner';
import AddressMap from '~/components/AddressMap';

const FileUpload = lazy(() => import('../components/FileUpload'));

export default function Home() {
  const [addresses, setAddresses] = createSignal<Address[]>([]);

  return (
    <Suspense fallback={<Circles />}>
      <main class="flex flex-col h-[calc(100dvh)]">
        <FileUpload onAddresses={setAddresses} />
        <div class="flex-1">
          <AddressMap addresses={addresses()} />
        </div>
      </main>
    </Suspense>
  );
}
