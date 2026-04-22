// Тексты для PDF-инвойсов. Язык определяется по counterparty.preferredLanguage.

export type PdfLang = "en" | "th" | "ru";

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
  sellingPrice: string;
  subtotal: string;
  vat: string;
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
    sellingPrice: "Selling price",
    subtotal: "Subtotal",
    vat: "VAT 7%",
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
    sellingPrice: "ราคาขาย",
    subtotal: "รวม",
    vat: "ภาษีมูลค่าเพิ่ม 7%",
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
  ru: {
    invoice: "СЧЁТ-ФАКТУРА",
    receipt: "КВИТАНЦИЯ",
    number: "№",
    issueDate: "Дата выпуска",
    dueDate: "Срок оплаты",
    billTo: "Кому",
    from: "От",
    description: "Описание",
    project: "Проект",
    unit: "Юнит",
    qty: "Кол-во",
    rate: "Ставка",
    amount: "Сумма",
    commission: "Комиссия",
    bonus: "Бонус",
    sellingPrice: "Цена продажи",
    subtotal: "Итого",
    vat: "НДС 7%",
    wht: "Удерживаемый налог 3%",
    total: "К оплате",
    totalUsdEquivalent: "Итого (эквивалент в USD)",
    exchangeRate: "Курс",
    paymentDetails: "Платёжные реквизиты",
    bankName: "Банк",
    accountName: "Владелец счёта",
    accountNumber: "Номер счёта",
    swift: "SWIFT",
    branch: "Филиал",
    bankAddress: "Адрес банка",
    paymentTerms: "Условия оплаты",
    cash: "Оплата наличными",
    crypto: "Оплата в крипте",
    notes: "Примечания",
    taxId: "ИНН",
    registrationNo: "Рег. номер",
    phone: "Телефон",
    email: "E-mail",
    paidOn: "Оплачено",
    cancelled: "ОТМЕНЁН",
    cancelledReason: "Причина",
    page: "Страница",
    of: "из",
  },
};

export function t(lang: PdfLang): Dict {
  return dicts[lang];
}
