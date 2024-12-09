import { read, utils, type WorkBook } from 'xlsx';
import type { Address, AddressFields } from '../types';
import consola from 'consola';
import { createSignal } from 'solid-js';
import { useToast } from '~/hooks/useToast';

interface Props {
  onAddresses: (addresses: Address[]) => void;
}

const SUPPORTED_EXTENSIONS = ['.xlsx', '.xls', '.csv'] as const;

export function FileUpload(props: Props) {
    const [isProcessing, setIsProcessing] = createSignal(false);
    const toast = useToast();

    const validateFileType = (fileName: string): boolean => {
      const ext = fileName.slice(((fileName.lastIndexOf('.') - 1) >>> 0) + 2);
      return SUPPORTED_EXTENSIONS.includes(
        `.${ext.toLowerCase()}` as (typeof SUPPORTED_EXTENSIONS)[number],
      );
    };

    const handleFile = async (event: Event) => {
      try {
        setIsProcessing(true);
        const file = (event.target as HTMLInputElement).files?.[0];

        if (!file) {
          consola.error('No file selected');
          return;
        }

        // Validate file type
        if (!validateFileType(file.name)) {
          toast.error({
            message: `Invalid file type. Supported formats: ${SUPPORTED_EXTENSIONS.join(', ')}`,
            timeout: 5000,
          });
          return;
        }

        // Validate file size (100MB limit)
        if (file.size > 100 * 1024 * 1024) {
          toast.error({
            message: 'File too large. Maximum size is 100MB',
            timeout: 5000,
          });
          return;
        }

        consola.start('Reading file:', file.name);
        const buffer = await file.arrayBuffer();
        consola.success('File read successfully');

        let workbook: WorkBook | undefined;
        try {
          workbook = read(buffer);
        } catch (error) {
          toast.error({
            message: 'Failed to parse file. Please check the file format.',
            timeout: 5000,
          });
          consola.error('Failed to parse file:', error);
          return;
        }

        if (!workbook.SheetNames.length) {
          toast.error({
            message: 'The spreadsheet contains no sheets',
            timeout: 5000,
          });
          return;
        }

        console.log('Workbook sheets:', workbook.SheetNames);
        const worksheet = workbook.Sheets[workbook.SheetNames[0]];

        let data: Record<string, any>[] = [];
        try {
          data = utils.sheet_to_json<Record<string, any>>(worksheet);
        } catch (error) {
          toast.error({
            message: 'Failed to read spreadsheet data',
            timeout: 5000,
          });
          consola.error('Failed to read spreadsheet data:', error);
          return;
        }

        if (!data.length) {
          toast.error({
            message: 'No data found in the spreadsheet',
            timeout: 5000,
          });
          return;
        }

        consola.info('Raw data first row:', data[0]);
        consola.info('Raw data column names:', Object.keys(data[0]));

        // Map the data based on actual column names
        const addresses = data
          .map((row) => {
            // Log each row to see the structure
            consola.start('Processing row:', row);

            // Try to find address-related fields
            const addressFields = {
              street:
                row.street ||
                row.Street ||
                row.address ||
                row.Address ||
                row.propertyAddress ||
                row['Property Street'] ||
                row['Property Address'],
              city:
                row.city ||
                row.City ||
                row.municipality ||
                row.Municipality ||
                row.propertyCity ||
                row['Property City'],
              state:
                row.state ||
                row.State ||
                row.province ||
                row.Province ||
                row.propertyState ||
                row['Property State'],
              zip:
                row.zip ||
                row.Zip ||
                row.ZIP ||
                row.postal ||
                row.PostalCode ||
                row.propertyZip ||
                row['Property Zip'],
            };

            // Log found fields
            consola.info('Found address fields:', addressFields);

            // Only include rows that have some address data
            if (!Object.values(addressFields).some(Boolean)) {
              consola.info('Skipping row - no address data found');
              return null;
            }

            const fields: AddressFields = {
              street: addressFields.street.trim(),
              city: addressFields.city.trim(),
              state: addressFields.state.trim(),
              zip: addressFields.zip.toString().trim(),
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

        if (!addresses.length) {
          toast.error({
            message: 'No valid addresses found in the file',
            timeout: 5000,
          });
          return;
        }

        consola.success('Processed addresses:', addresses);
        props.onAddresses(addresses);
        toast.success({
          message: `Successfully loaded ${addresses.length} addresses for processing`,
          timeout: 3000,
        });
      } catch (error) {
        consola.error('File processing error:', error);
        toast.error({
          message:
            'Failed to process file. Please check the format and try again.',
          timeout: 5000,
        });
      } finally {
        setIsProcessing(false);
        // Reset the file input
        (event.target as HTMLInputElement).value = '';
      }
    };

    return (
      <div class="p-4 text-center">
        <input
          type="file"
          accept=".xlsx,.xls,.csv"
          onChange={handleFile}
          disabled={isProcessing()}
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
export default FileUpload;
