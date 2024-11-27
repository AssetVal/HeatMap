export interface AddressFields {
	street?: string;
	city?: string;
	state?: string;
	zip?: string;
}

export interface Address {
	address: string;
	fields: AddressFields;
	lat?: number;
	lng?: number;
}
