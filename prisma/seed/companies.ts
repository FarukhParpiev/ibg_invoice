// Реестр наших компаний — синхронизирован с docs/Наши_компании.md
// Используется в seed-скрипте и миграционных импортах.

import type { LegalType, Currency } from "@prisma/client";

export type SeedCompany = {
  name: string;
  legalType: LegalType;
  address: string | null;
  taxId: string | null;
  registrationNo: string | null;
  phone: string | null;
  email: string | null;
  defaultCurrency: Currency;
  bankAccounts: Array<{
    bankName: string;
    accountName: string;
    accountNumber: string;
    swift: string | null;
    branch: string | null;
    bankAddress: string | null;
    currency: Currency;
    isDefault: boolean;
  }>;
};

export const seedCompanies: SeedCompany[] = [
  {
    name: "IB Global Partners LLP",
    legalType: "offshore",
    address:
      "71-75 Shelton Street, Covent Garden, London, WC2H 9JQ, United Kingdom",
    taxId: null,
    registrationNo: "OC457023",
    phone: "+66 99 364 9444",
    email: "faruhparpiev@gmail.com",
    defaultCurrency: "USD",
    bankAccounts: [
      {
        bankName: "Wise US Inc",
        accountName: "IB Global Partners LLP",
        accountNumber: "212915226775",
        swift: "TRWIUS35XXX",
        branch: null,
        bankAddress:
          "30 W. 26TH Street, Sixth Floor, New York NY 10010, United States",
        currency: "USD",
        isDefault: true,
      },
    ],
  },
  {
    name: "IB GROUP INCORPORATED",
    legalType: "offshore",
    address:
      "No.416, Burlington Tower, Business Bay, P.O.Box 487644, Dubai, United Arab Emirates",
    taxId: "ICC20230904",
    registrationNo: null,
    phone: null,
    email: null,
    defaultCurrency: "USD",
    bankAccounts: [
      {
        bankName: "Citibank, N.A., Hong Kong Branch",
        accountName: "IB GROUP INCORPORATED",
        accountNumber: "390205771",
        swift: "CITIHKHX",
        branch: "391",
        bankAddress:
          "49th Floor, Champion Tower 3, Garden Road, Central, HKG",
        currency: "USD",
        isDefault: true,
      },
    ],
  },
  {
    name: "IBG Property Co., Ltd. (Head Office)",
    legalType: "resident",
    address:
      "4/2 Srisoothorn Road, Tambol Chengtalay, Amphur Thalang, Phuket 83110",
    taxId: "0 83 556 0018 301",
    registrationNo: null,
    phone: "+66 99 364 9444",
    email: "info@ibgproperty.com",
    defaultCurrency: "THB",
    bankAccounts: [
      {
        bankName: "The Siam Commercial Bank Public Company Limited",
        accountName: "IBG Property Company Limited",
        accountNumber: "817 288 969 7",
        swift: "SICOTHBK",
        branch: "0817",
        bankAddress: null,
        currency: "THB",
        isDefault: true,
      },
    ],
  },
  {
    name: "Tipifier Company Limited",
    legalType: "resident",
    address: "9/511 Moo6, Tambol Chalong, Amphur Muang, Phuket 83000",
    taxId: "0835555012825",
    registrationNo: null,
    phone: null,
    email: null,
    defaultCurrency: "THB",
    bankAccounts: [
      {
        bankName: "The Siam Commercial Bank Public Company Limited",
        accountName: "Tipifier Company Limited",
        accountNumber: "817-279792-1",
        swift: "SICOTHBK",
        branch: "0817",
        bankAddress: null,
        currency: "THB",
        isDefault: true,
      },
    ],
  },
  {
    name: "IBG Real Estate Co., Ltd",
    legalType: "resident",
    address:
      "20/128 Moo.2, Kohkeaw Sub-District, Muang Phuket, Phuket Province, Thailand",
    taxId: null, // TODO: уточнить
    registrationNo: null,
    phone: null,
    email: null,
    defaultCurrency: "THB",
    bankAccounts: [
      {
        bankName: "The Siam Commercial Bank Public Company Limited",
        accountName: "Ibg Real Estate Co., Ltd",
        accountNumber: "886-223788-3",
        swift: "SICOTHBK",
        branch: "0886",
        bankAddress: null,
        currency: "THB",
        isDefault: true,
      },
    ],
  },
  {
    name: "IBG Holdings Co., Ltd",
    legalType: "resident",
    address: "68/76 Moo2, Tambon Vichit, Amphur Muang, Phuket 83000",
    taxId: "0835560087414",
    registrationNo: null,
    phone: null,
    email: null,
    defaultCurrency: "THB",
    bankAccounts: [
      {
        bankName: "The Siam Commercial Bank Public Company Limited",
        accountName: "Ibg Holdings Co., Ltd",
        accountNumber: "633-299474-3",
        swift: "SICOTHBK",
        branch: "0633",
        bankAddress: null,
        currency: "THB",
        isDefault: true,
      },
    ],
  },
  {
    name: "IBG Phuket Co., Ltd",
    legalType: "resident",
    address: "Tambon Vichit, Amphur Muang, Phuket 83000", // TODO: уточнить номер
    taxId: null, // TODO: уточнить
    registrationNo: null,
    phone: null,
    email: null,
    defaultCurrency: "THB",
    bankAccounts: [
      {
        bankName: "Kasikorn Bank Public Company Limited",
        accountName: "Ibg Phuket Co., Ltd",
        accountNumber: "213-8-80229-1",
        swift: "KASITHBK",
        branch: "0482",
        bankAddress: null,
        currency: "THB",
        isDefault: true,
      },
    ],
  },
  {
    name: "Soulmates Community Co., Ltd",
    legalType: "resident",
    address: "32/67 Moo.1, Tambon Vichit, Amphur Muang Phuket 83000",
    taxId: "0835562005626",
    registrationNo: null,
    phone: null,
    email: null,
    defaultCurrency: "THB",
    bankAccounts: [
      {
        bankName: "Kasikorn Bank Public Company Limited",
        accountName: "Soulmates Community Co., Ltd",
        accountNumber: "219-3-21970-8",
        swift: "KASITHBK",
        branch: null, // TODO: уточнить
        bankAddress: null,
        currency: "THB",
        isDefault: true,
      },
    ],
  },
  {
    name: "Rise Development Co., Ltd",
    legalType: "resident",
    address: "123/159 Moo2, Tambon Kohkeaw, Amphur Muang, Phuket 83000",
    taxId: null, // TODO: уточнить
    registrationNo: null,
    phone: null,
    email: null,
    defaultCurrency: "THB",
    bankAccounts: [
      {
        bankName: "Kasikorn Bank Public Company Limited",
        accountName: "Rise Development Co., Ltd",
        accountNumber: "220-1-11339-6",
        swift: "KASITHBK",
        branch: null, // TODO: уточнить
        bankAddress: null,
        currency: "THB",
        isDefault: true,
      },
    ],
  },
];
