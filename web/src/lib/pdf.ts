// PDF generation helpers using html2pdf.js (wraps html2canvas + jsPDF with
// CSS-aware page break handling). Sections that have `pageBreakInside: 'avoid'`
// in their inline style won't get split across pages.
import html2pdf from 'html2pdf.js';

const baseOptions = (filename: string): any => ({
  // [vertical, horizontal] in mm. NcrReport is 794px ≈ A4 width @ 96 DPI,
  // so horizontal margin must be 0 to avoid clipping. Vertical 10mm gives
  // breathing room at the top of each page after a page break.
  margin: [10, 0],
  filename,
  image: { type: 'jpeg', quality: 0.95 },
  html2canvas: { scale: 2, backgroundColor: '#fff', useCORS: true, logging: false },
  jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
  pagebreak: { mode: ['css', 'avoid-all'] }
});

async function waitForImages(element: HTMLElement) {
  const imgs = element.querySelectorAll('img');
  await Promise.all(Array.from(imgs).map(img =>
    img.complete ? Promise.resolve() : new Promise(resolve => {
      img.onload = resolve;
      img.onerror = resolve;
      setTimeout(resolve, 5000);
    })
  ));
}

/** Generate a PDF and return it as a data URI ("data:application/pdf;base64,..."). */
export async function generatePdfDataUri(element: HTMLElement, filename: string): Promise<string> {
  await waitForImages(element);
  const worker = html2pdf().set(baseOptions(filename)).from(element);
  await worker.toPdf();
  const pdf: any = await worker.get('pdf');
  return pdf.output('datauristring');
}

/** Generate a PDF and trigger browser download. */
export async function downloadPdf(element: HTMLElement, filename: string): Promise<void> {
  await waitForImages(element);
  await html2pdf().set(baseOptions(filename)).from(element).save();
}
