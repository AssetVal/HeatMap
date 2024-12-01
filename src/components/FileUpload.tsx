import { read, utils } from 'xlsx';
import type { Address, AddressFields } from '../types';
import consola from 'consola';

interface Props {
  onAddresses: (addresses: Address[]) => void;
}

export function FileUpload(props: Props) {
  const handleFile = async (event: Event) => {
    console.log('File upload triggered');
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) {
      console.log('No file selected');
      return;
    }

    console.log('Reading file:', file.name);
    const buffer = await file.arrayBuffer();
    const workbook = read(buffer);
    console.log('Workbook sheets:', workbook.SheetNames);

    const worksheet = workbook.Sheets[workbook.SheetNames[0]];
    const data = utils.sheet_to_json<Record<string, any>>(worksheet);
    console.log('Raw data first row:', data[0]);
    console.log('Raw data column names:', Object.keys(data[0]));

    // Map the data based on actual column names
    const addresses = data
      .map((row) => {
        // Log each row to see the structure
        consola.start('Processing row:', row);

        // Try to find address-related fields
        const addressFields = {
          street: row.street || row.Street || row.address || row.Address,
          city: row.city || row.City,
          state: row.state || row.State,
          zip: row.zip || row.Zip || row.ZIP || row.postal || row.PostalCode,
        };

        // Log found fields
        consola.info('Found address fields:', addressFields);

        // Only include rows that have some address data
        if (!Object.values(addressFields).some(Boolean)) {
          consola.info('Skipping row - no address data found');
          return null;
        }

        const fields: AddressFields = {
          street: addressFields.street,
          city: addressFields.city,
          state: addressFields.state,
          zip: addressFields.zip,
        };

        const addressParts = [
          fields.street,
          fields.city,
          fields.state,
          fields.zip,
        ].filter(Boolean);

        return {
          address: addressParts.join(', '),
          fields,
        };
      })
      .filter(Boolean) as Address[];

    consola.success('Processed addresses:', addresses);
    props.onAddresses(addresses);
  };

  return (
    <div class="p-4 text-center">
      <input
        type="file"
        accept=".xlsx,.xls,.csv"
        onChange={handleFile}
        class="border border-gray-300 p-2 rounded"
      />
      <p class="mt-2 text-sm text-gray-600">
        Sample format: street, city, state, zip
      </p>
      <p class="mt-1 text-xs text-gray-500">
        Example: "123 Main St, Portland, OR, 97201"
      </p>
    </div>
  );
}
