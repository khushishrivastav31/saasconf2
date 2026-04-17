import { useMemo, useState } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';
import { LoadingSpinner } from '../../../../components/common/LoadingSpinner';

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url
).toString();

export default function InvoicePdfPreview({ pdfBytes }: { pdfBytes: Uint8Array }) {
  const [pdfNumPages, setPdfNumPages] = useState(0);
  const pdfFile = useMemo(() => ({ data: new Uint8Array(pdfBytes) }), [pdfBytes]);

  return (
    <div className="mb-4 border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden bg-gray-100 dark:bg-gray-900">
      <div className="overflow-auto" style={{ maxHeight: '75vh' }}>
        <Document
          file={pdfFile}
          onLoadSuccess={({ numPages }) => setPdfNumPages(numPages)}
          loading={
            <div className="flex items-center justify-center py-12">
              <LoadingSpinner />
            </div>
          }
        >
          {Array.from({ length: pdfNumPages }, (_, i) => (
            <Page key={i + 1} pageNumber={i + 1} width={800} className="mx-auto" />
          ))}
        </Document>
      </div>
    </div>
  );
}
