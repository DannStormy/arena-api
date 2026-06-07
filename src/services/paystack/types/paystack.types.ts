export interface PaystackInitializeResponse {
  status: boolean;
  message: string;
  data: {
    authorization_url: string;
    access_code: string;
    reference: string;
  };
}

export interface PaystackCustomer {
  id: number;
  first_name: string;
  last_name: string;
  email: string;
  customer_code: string;
  phone: string;
  metadata: Record<string, unknown>;
  risk_action: string;
  international_format_phone: string;
}

export interface PaystackVerifyData {
  id: number;
  domain: string;
  status: string;
  reference: string;
  amount: number;
  message: string;
  gateway_response: string;
  paid_at: string;
  created_at: string;
  channel: string;
  currency: string;
  ip_address: string;
  metadata: Record<string, unknown>;
  customer: PaystackCustomer;
}

export interface PaystackVerifyResponse {
  status: boolean;
  message: string;
  data: PaystackVerifyData;
}

export interface PaystackBank {
  name: string;
  code: string;
}

export interface PaystackResolveAccountResponse {
  status: boolean;
  message: string;
  data: {
    account_number: string;
    account_name: string;
  };
}

export interface PaystackBanksResponse {
  status: boolean;
  message: string;
  data: Array<{ name: string; code: string; [key: string]: unknown }>;
}

export interface PaystackTransferRecipientResponse {
  status: boolean;
  message: string;
  data: {
    recipient_code: string;
    type: string;
    name: string;
    details: {
      account_number: string;
      account_name: string;
      bank_code: string;
      bank_name: string;
    };
  };
}

export interface PaystackTransferResponse {
  status: boolean;
  message: string;
  data: {
    transfer_code: string;
    amount: number;
    currency: string;
    status: string;
  };
}
