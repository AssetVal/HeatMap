import { type USState, USStateConverter } from '@assetval/state-switcher';
import {
  Configuration,
  UsVerificationsApi,
  UsVerificationsWritable,
} from '@lob/lob-typescript-sdk';
import ZipMonster from '@simplisticated/zip-monster';
import { type ZipInformation } from '@simplisticated/zip-monster/dist/data/models/zip-information';
import consola from 'consola';
import type {
  ConfirmedAddress,
  UnconfirmedAddress,
  GoogleAddressValidationReturn,
  LobAddressValidationReturn,
  GoogleAddressValidationResult,
  BasicAddress,
} from '~/types';

export const IsConfirmedAddress = (
  address: ConfirmedAddress | UnconfirmedAddress,
): address is ConfirmedAddress => address.allValid === true;
export const IsUnconfirmedAddress = (
  address: ConfirmedAddress | UnconfirmedAddress,
): address is UnconfirmedAddress => address.allValid === false;

export class AddressValidationService {
  private address: BasicAddress;

  constructor(address: BasicAddress) {
    this.address = address;
  }

  private static geolocateZipCode(zip: string): Promise<ZipInformation[]> {
    try {
      return new Promise((resolve, reject) => {
        // Now we return a promise that resolves with ZipMonster.find({ zip });
        const locationInfo = ZipMonster.find({ zip }) as ZipInformation[];
        if (locationInfo) {
          resolve(locationInfo);
        } else {
          reject(new Error('Zip code not found'));
        }
      });
    } catch (error) {
      if (error instanceof Error) {
        console.error(error.message);
      }
      throw error as Error;
    }
  }

  private async ValidateAddressViaGoogle(): GoogleAddressValidationReturn {
    try {
      const { street, unitNumber, city, state, zip } = this.address;

      const response = await fetch(
        `https://addressvalidation.googleapis.com/v1:validateAddress?key=${encodeURIComponent(import.meta.env.VITE_GOOGLE_API_KEY!)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            address: {
              addressLines: [`${street} ${unitNumber ?? ''}`.trim()],
              locality: city,
              administrativeArea: state,
              postalCode: zip,
            },
          }),
        },
      );
      const results = (await response.json()) as {
        result?: GoogleAddressValidationResult;
        error?: { message: string };
      };
      if (!results) {
        throw new Error(
          'We encountered an error when trying to run our address validation service, please contact AssetVal I.T.',
        );
      }
      if (results.error) throw new Error(results.error.message);
      if (!results.result) {
        throw new Error(
          'We encountered an error when trying to run our address validation service, please contact AssetVal I.T.',
        );
      }

      const { result: GoogleResults } = results;
      const {
        geocode,
        address: { postalAddress, addressComponents },
        uspsData: { county },
      } = GoogleResults;

      const allValid = addressComponents.every(
        (component) => component.confirmationLevel === 'CONFIRMED',
      );

      if (
        !geocode?.location?.latitude ||
        !geocode?.location.longitude ||
        geocode.location.latitude === 0 ||
        geocode.location.longitude === 0
      ) {
        const zipToVerify = postalAddress.postalCode.split('-')[0] ?? zip;
        const [zipInfo] =
          await AddressValidationService.geolocateZipCode(zipToVerify);
        if (!zipInfo || !zipInfo.location) {
          throw new Error(
            'We encountered an error when trying to run our address validation service, please contact AssetVal I.T.',
          );
        }
        if (zipInfo) geocode.location = zipInfo.location;
      }

      const suggestions = {
        street: addressComponents.find(
          (component) => component.componentType === 'street',
        )?.componentName.text,
        zip: addressComponents.find(
          (component) => component.componentType === 'zip',
        )?.componentName.text,
        state: addressComponents.find(
          (component) => component.componentType === 'state',
        )?.componentName.text,
      };

      if (!allValid) {
        return {
          allValid: false,
          issues: addressComponents.filter(
            (component) => component.confirmationLevel !== 'CONFIRMED',
          ),
          validatedAddress: {
            street: postalAddress.addressLines[0],
            unitNumber: postalAddress.addressLines?.[1],
            city: postalAddress.locality,
            state: USStateConverter.convert(
              postalAddress.administrativeArea,
              'long',
            ),
            zip: postalAddress.postalCode.split('-')[0],
            county,
          },
          originalAddress: { ...this.address },
          suggestions,
          geocode,
          verifiedWith: 'Google',
        } as UnconfirmedAddress & { verifiedWith: 'Google' };
      } else {
        return {
          allValid: true,
          validatedAddress: {
            street: postalAddress.addressLines[0],
            unitNumber: postalAddress.addressLines?.[1],
            city: postalAddress.locality,
            state: USStateConverter.convert(
              postalAddress.administrativeArea,
              'long',
            ) as USState,
            zip: postalAddress.postalCode.split('-')[0],
            county,
          },
          originalAddress: { ...this.address },
          suggestions: {},
          issues: [],
          geocode,
          verifiedWith: 'Google',
        } as ConfirmedAddress & { verifiedWith: 'Google' };
      }
    } catch (error) {
      console.error(error);
      consola.error({
        message: 'Error during address validation via google',
        additional: {
          address: this.address,
          error,
          apiKey: import.meta.env.VITE_GOOGLE_API_KEY,
        },
      });
      throw error as Error;
    }
  }

  private async validateAddressViaLob(): LobAddressValidationReturn {
    try {
      const { street, unitNumber, city, state, zip } = this.address;
      const config: Configuration = new Configuration({
        username: import.meta.env.VITE_LOB_API_KEY,
      });

      const suggestions: { street?: string; zip?: string; state?: string } = {};
      const address = new UsVerificationsWritable({
        primary_line: street.toUpperCase(),
        city: city.toUpperCase(),
        state: state.toUpperCase(),
        zip_code: zip,
      });
      if (unitNumber) {
        address.secondary_line = unitNumber.toString().toUpperCase();
      }

      // Auth the Lob Verification API
      const UsVerification = new UsVerificationsApi(config);
      // Verify the Address as they've formatted it
      const verificationResponse = await UsVerification.verifySingle(address);
      if (!verificationResponse) {
        throw new Error(
          'We encountered an error when trying to run our address validation service, please contact AssetVal I.T.',
        );
      }

      if (verificationResponse.primary_line !== address.primary_line) {
        if (
          verificationResponse.components?.street_predirection ||
          verificationResponse.components?.street_postdirection
        ) {
          suggestions.street = 'cardinal direction';
        }
      }
      if (verificationResponse.components?.zip_code !== zip) {
        suggestions.zip = 'Zip Code Changed';
      }
      if (verificationResponse.components?.state !== state.toUpperCase()) {
        suggestions.state = 'State changed';
      }

      return {
        allValid: Object.keys(suggestions).length === 0, // No suggestions means the address is considered valid
        validatedAddress: {
          street: verificationResponse.primary_line!,
          unitNumber: verificationResponse.secondary_line,
          city: verificationResponse.components!.city,
          state: USStateConverter.convert(
            verificationResponse.components!.state,
            'long',
          ) as USState,
          zip: verificationResponse.components!.zip_code,
          county: verificationResponse.components!.county,
        },
        originalAddress: this.address,
        issues: Object.entries(suggestions).map(([key, value]) => ({
          componentName: { text: value, languageCode: 'en' },
          componentType: key,
          confirmationLevel: 'CONFIRMATION_LEVEL_UNSPECIFIED' as const,
          inferred: false,
          spellCorrected: false,
          replaced: false,
          unexpected: false,
        })),
        suggestions,
        geocode: {
          location: {
            latitude: verificationResponse.components!.latitude as number,
            longitude: verificationResponse.components!.longitude as number,
          },
        },
        verifiedWith: 'Lob',
      };
    } catch (error) {
      console.error(error);
      throw error;
    }
  }

  public async exec() {
    try {
      const GoogleResults = await this.ValidateAddressViaGoogle();
      if (GoogleResults.allValid) return GoogleResults;
      const {
        issues: GoogleIssues,
        validatedAddress: GoogleValidatedAddress,
        geocode: GoogleGeocode,
      } = GoogleResults;

      const LobResults = await this.validateAddressViaLob();
      if (LobResults.allValid) return LobResults;
      const {
        issues: LobIssues,
        validatedAddress: LobValidatedAddress,
        geocode: LobGeocode,
        suggestions: LobSuggestions,
      } = LobResults;

      Object.values(GoogleValidatedAddress).forEach((v) => {
        // @ts-ignore
        if (v === '') v = null;
      });

      if (
        !GoogleGeocode?.location?.latitude ||
        !GoogleGeocode?.location.longitude ||
        GoogleGeocode.location.latitude === 0 ||
        GoogleGeocode.location.longitude === 0
      ) {
        const zipToVerify =
          GoogleValidatedAddress.zip ??
          LobValidatedAddress.zip ??
          this.address.zip;
        const [zipInfo] =
          await AddressValidationService.geolocateZipCode(zipToVerify);
        // Also set this for what ever the proximityAddress represents (vendor.useWhichAddress)
        const { location } = zipInfo;
        if (location) GoogleGeocode.location = location;
      }

      return {
        allValid: false,
        issues: GoogleIssues.concat(LobIssues),
        suggestions: LobSuggestions,
        validatedAddress: {
          street: GoogleValidatedAddress.street ?? LobValidatedAddress.street,
          unitNumber:
            GoogleValidatedAddress.unitNumber ?? LobValidatedAddress.unitNumber,
          city: GoogleValidatedAddress.city ?? LobValidatedAddress.city,
          state: GoogleValidatedAddress.state ?? LobValidatedAddress.state,
          zip: GoogleValidatedAddress.zip ?? LobValidatedAddress.zip,
          county: GoogleValidatedAddress.county ?? LobValidatedAddress.county,
        },
        originalAddress: this.address,
        geocode: {
          ...LobGeocode,
          ...GoogleGeocode,
        },
        verifiedWith: 'Lob' as const,
      };
    } catch (err) {
      console.error(err);
      throw err;
    }
  }
}
