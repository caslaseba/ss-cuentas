export type TransactionType = "ingreso" | "egreso";
export type CurrencyCode = "ARS" | "USD";
export type AccountKind = "efectivo" | "caja_ahorro" | "billetera";
export type CardKind = "principal" | "extension";
export type PaymentMethod =
  | "efectivo"
  | "debito"
  | "transferencia"
  | "billetera"
  | "tarjeta_credito";
export type RecurrenceFrequency = "mensual" | "semanal" | "anual";

export type Profile = {
  id: string;
  email: string | null;
  full_name: string | null;
  local_currency: CurrencyCode;
  usd_exchange_rate: number;
  tax_surcharge_pct: number;
};

export type Category = {
  id: string;
  user_id: string;
  name: string;
  type: TransactionType;
  icon: string;
  monthly_limit: number | null;
};

export type Account = {
  id: string;
  user_id: string;
  name: string;
  kind: AccountKind;
  currency: CurrencyCode;
  balance: number;
  is_savings_box: boolean;
  notes: string | null;
};

export type CreditCard = {
  id: string;
  user_id: string;
  name: string;
  kind: CardKind;
  parent_card_id: string | null;
  closing_day: number;
  due_day: number;
  credit_limit: number;
  available_limit: number;
  usd_tax_pct: number;
  last4: string | null;
};

export type Installment = {
  id: string;
  user_id: string;
  credit_card_id: string;
  concept: string;
  currency: CurrencyCode;
  total_amount: number;
  installment_count: number;
  installment_amount: number;
  start_date: string;
  current_installment: number;
};

export type Transaction = {
  id: string;
  user_id: string;
  type: TransactionType;
  amount: number;
  currency: CurrencyCode;
  category_id: string | null;
  account_id: string | null;
  credit_card_id: string | null;
  installment_id: string | null;
  installment_number: number | null;
  concept: string;
  payment_method: PaymentMethod;
  occurred_on: string;
  notes: string | null;
  source: "manual" | "voz" | "recurrente" | "cuota";
};

export type RecurringPayment = {
  id: string;
  user_id: string;
  name: string;
  amount: number;
  currency: CurrencyCode;
  frequency: RecurrenceFrequency;
  due_day: number;
  is_paid: boolean;
  paid_month: string | null;
  category_id: string | null;
  account_id: string | null;
  notes: string | null;
};

export type VoiceParseResult = {
  type: TransactionType;
  amount: number | null;
  currency: CurrencyCode;
  concept: string;
  installmentCount: number | null;
  installmentAmount: number | null;
  cardHint: "principal" | "extension" | null;
  paymentMethod: PaymentMethod;
  raw: string;
  confidence: "alta" | "media" | "baja";
};
