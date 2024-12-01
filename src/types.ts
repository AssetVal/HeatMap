import type { USState, USStateAbbreviations } from '@assetval/state-switcher';

type AddressCorrectionComponent = {
  componentName: { text: string; languageCode: string };
  componentType: string;
  confirmationLevel:
    | 'CONFIRMATION_LEVEL_UNSPECIFIED'
    | 'CONFIRMED'
    | 'UNCONFIRMED_BUT_PLAUSIBLE'
    | 'UNCONFIRMED_AND_SUSPICIOUS';
  inferred: boolean;
  spellCorrected: boolean;
  replaced: boolean;
  unexpected: boolean;
};

type GoogleAddressGranularity =
  | 'GRANULARITY_UNSPECIFIED' // Default value. This value is unused.
  | 'SUB_PREMISE' // Below-building level result, such as an apartment.
  | 'PREMISE' // Building-level result.
  | 'PREMISE_PROXIMITY' // A geocode that approximates the building-level location of the address.
  | 'BLOCK' // The address or geocode indicates a block. Only used in regions which have block-level addressing, such as Japan.
  | 'ROUTE' // The geocode or address is granular to route, such as a street, road, or highway.
  | 'OTHER'; // All other granularity's, which are bucketed together since they are not deliverable.

export type GoogleAddressValidationResult = {
  // Validation verdict.
  verdict: {
    inputGranularity: GoogleAddressGranularity;
    validationGranularity: GoogleAddressGranularity;
    geocodeGranularity: GoogleAddressGranularity;
    addressComplete: boolean;
    hasUnconfirmedComponents: boolean;
    hasInferredComponents: boolean;
    hasReplacedComponents: boolean;
  };
  // Address details determined by the API.
  address: {
    formattedAddress: string;
    postalAddress: {
      revision: number;
      regionCode: string;
      languageCode: string;
      postalCode: string;
      sortingCode: string;
      administrativeArea: USStateAbbreviations;
      locality: string;
      sublocality: string;
      addressLines: Array<string>;
      recipients: Array<string>;
      organization: string;
    };
    addressComponents: AddressCorrectionComponent[];
    missingComponentTypes: Array<string>;
    unconfirmedComponentTypes: Array<string>;
    unresolvedTokens: Array<string>;
  };
  // The geocode generated for the input address.
  geocode: {
    bounds: {
      high: { latitude: number; longitude: number };
      low: { latitude: number; longitude: number };
    };
    featureSizeMeters: number;
    location: { latitude: number; longitude: number };
    placeId: string;
    placeTypes: Array<string>;
    plusCode: { globalCode: string };
  };
  // Information indicating if the address is a business, residence, etc.
  metadata: { business?: boolean; poBox?: boolean; residential?: boolean };
  // Information about the address from the US Postal Service
  // ("US" and "PR" addresses only).
  uspsData: {
    standardizedAddress: {
      firstAddressLine: string;
      firm: string;
      secondAddressLine: string;
      urbanization: string;
      cityStateZipAddressLine: string;
      city: string;
      state: string;
      zipCode: string;
      zipCodeExtension: string;
    };
    deliveryPointCode: string;
    deliveryPointCheckDigit: string;
    dpvConfirmation: string;
    dpvFootnote: string;
    dpvCmra: string;
    dpvVacant: string;
    dpvNoStat: string;
    dpvNoStatReasonCode: number;
    dpvDrop: string;
    dpvThrowback: string;
    dpvNonDeliveryDays: string;
    dpvNonDeliveryDaysValues: number;
    dpvNoSecureLocation: string;
    dpvPbsa: string;
    dpvDoorNotAccessible: string;
    dpvEnhancedDeliveryCode: string;
    carrierRoute: string;
    carrierRouteIndicator: string;
    ewsNoMatch: boolean;
    postOfficeCity: string;
    postOfficeState: string;
    abbreviatedCity: string;
    fipsCountyCode: string;
    county: string;
    elotNumber: string;
    elotFlag: string;
    lacsLinkReturnCode: string;
    lacsLinkIndicator: string;
    poBoxOnlyPostalCode: boolean;
    suitelinkFootnote: string;
    pmbDesignator: string;
    pmbNumber: string;
    addressRecordType: string;
    defaultAddress: boolean;
    errorMessage: string;
    cassProcessed: boolean;
  };
};

export type BasicAddress = {
  street: string;
  unitNumber?: string;
  city: string;
  state: USStateAbbreviations;
  zip: string;
};

type ValidateAddressReturnInfo = {
  validatedAddress: Omit<BasicAddress, 'state'> & {
    state: USState;
    county?: string;
  };
  originalAddress: BasicAddress;
  geocode: Partial<GoogleAddressValidationResult['geocode']> &
    Pick<GoogleAddressValidationResult['geocode'], 'location'>;
};

export type ConfirmedAddress = ValidateAddressReturnInfo & {
  allValid: true;
  issues: Array<AddressCorrectionComponent>;
  suggestions?: { street?: string; zip?: string; state?: string };
};
export type UnconfirmedAddress = ValidateAddressReturnInfo & {
  allValid: false;
  issues: Array<AddressCorrectionComponent>;
  suggestions: { street?: string; zip?: string; state?: string };
};

export type GoogleAddressValidationReturn = Promise<
  | (ConfirmedAddress & { verifiedWith: 'Google' })
  | (UnconfirmedAddress & { verifiedWith: 'Google' })
>;
export type LobAddressValidationReturn = Promise<
  | (ConfirmedAddress & { verifiedWith: 'Lob' })
  | (UnconfirmedAddress & { verifiedWith: 'Lob' })
>;

export interface AddressFields {
  street?: string;
  city?: string;
  state?: USStateAbbreviations;
  zip?: string;
}

export interface Address {
  address: string;
  fields: AddressFields;
  lat?: number;
  lng?: number;
}
