// Text strings for PDF invoices. Language is picked from counterparty.preferredLanguage.

export type PdfLang = "en" | "th";

type Dict = {
  invoice: string;
  receipt: string;
  number: string;
  issueDate: string;
  dueDate: string;
  billTo: string;
  from: string;
  description: string;
  project: string;
  unit: string;
  qty: string;
  rate: string;
  amount: string;
  commission: string;
  bonus: string;
  other: string;
  sellingPrice: string;
  subtotal: string;
  vat: string;
  vatIncluded: string; // suffix to VAT when the tax is already embedded in line amounts
  wht: string;
  total: string;
  totalUsdEquivalent: string;
  exchangeRate: string;
  paymentDetails: string;
  bankName: string;
  accountName: string;
  accountNumber: string;
  swift: string;
  branch: string;
  bankAddress: string;
  paymentTerms: string;
  cash: string;
  crypto: string;
  notes: string;
  taxId: string;
  registrationNo: string;
  phone: string;
  email: string;
  paidOn: string;
  cancelled: string;
  cancelledReason: string;
  page: string;
  of: string;
};

const dicts: Record<PdfLang, Dict> = {
  en: {
    invoice: "INVOICE",
    receipt: "RECEIPT",
    number: "No.",
    issueDate: "Issue date",
    dueDate: "Due date",
    billTo: "Bill to",
    from: "From",
    description: "Description",
    project: "Project",
    unit: "Unit",
    qty: "Qty",
    rate: "Rate",
    amount: "Amount",
    commission: "Commission",
    bonus: "Bonus",
    other: "Other",
    sellingPrice: "Selling price",
    subtotal: "Subtotal",
    vat: "VAT 7%",
    vatIncluded: "included",
    wht: "Withholding tax 3%",
    total: "Total",
    totalUsdEquivalent: "Total (USD equivalent)",
    exchangeRate: "Exchange rate",
    paymentDetails: "Payment details",
    bankName: "Bank",
    accountName: "Account name",
    accountNumber: "Account number",
    swift: "SWIFT",
    branch: "Branch",
    bankAddress: "Bank address",
    paymentTerms: "Payment terms",
    cash: "Cash payment",
    crypto: "Crypto payment",
    notes: "Notes",
    taxId: "Tax ID",
    registrationNo: "Registration No.",
    phone: "Phone",
    email: "Email",
    paidOn: "Paid on",
    cancelled: "CANCELLED",
    cancelledReason: "Reason",
    page: "Page",
    of: "of",
  },
  th: {
    invoice: "ใบแจ้งหนี้",
    receipt: "ใบเสร็จรับเงิน",
    number: "เลขที่",
    issueDate: "วันที่ออก",
    dueDate: "ครบกำหนด",
    billTo: "เรียน",
    from: "จาก",
    description: "รายละเอียด",
    project: "โครงการ",
    unit: "ยูนิต",
    qty: "จำนวน",
    rate: "อัตรา",
    amount: "จำนวนเงิน",
    commission: "ค่าคอมมิชชั่น",
    bonus: "โบนัส",
    other: "อื่นๆ",
    sellingPrice: "ราคาขาย",
    subtotal: "รวม",
    vat: "ภาษีมูลค่าเพิ่ม 7%",
    vatIncluded: "รวมในยอดแล้ว",
    wht: "หัก ณ ที่จ่าย 3%",
    total: "ยอดรวมทั้งสิ้น",
    totalUsdEquivalent: "ยอดรวม (เทียบ USD)",
    exchangeRate: "อัตราแลกเปลี่ยน",
    paymentDetails: "รายละเอียดการชำระเงิน",
    bankName: "ธนาคาร",
    accountName: "ชื่อบัญชี",
    accountNumber: "เลขที่บัญชี",
    swift: "SWIFT",
    branch: "สาขา",
    bankAddress: "ที่อยู่ธนาคาร",
    paymentTerms: "เงื่อนไขการชำระ",
    cash: "ชำระเงินสด",
    crypto: "ชำระด้วยคริปโต",
    notes: "หมายเหตุ",
    taxId: "เลขประจำตัวผู้เสียภาษี",
    registrationNo: "เลขทะเบียน",
    phone: "โทรศัพท์",
    email: "อีเมล",
    paidOn: "ชำระเมื่อ",
    cancelled: "ยกเลิก",
    cancelledReason: "เหตุผล",
    page: "หน้า",
    of: "จาก",
  },
};

export function t(lang: PdfLang): Dict {
  return dicts[lang];
}
