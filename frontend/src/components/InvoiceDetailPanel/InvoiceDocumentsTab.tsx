import AttachmentList from "../AttachmentList";

interface InvoiceDocumentsTabProps {
  invoiceId: string;
}

export default function InvoiceDocumentsTab({
  invoiceId,
}: InvoiceDocumentsTabProps) {
  return (
    <div className="px-6 py-5">
      <AttachmentList entityType="invoice" entityId={invoiceId} />
    </div>
  );
}
