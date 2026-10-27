/** Dibuja las hojas de un PDF de factura para poder imprimirlas en el informe. */
export async function renderInvoicePages(data: ArrayBuffer) {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
  const doc = await pdfjs.getDocument({ data }).promise;
  const pages: string[] = [];
  const count = Math.min(doc.numPages, 6);
  for (let number = 1; number <= count; number += 1) {
    const page = await doc.getPage(number);
    const viewport = page.getViewport({ scale: 1.35 });
    const canvas = document.createElement("canvas");
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    const context = canvas.getContext("2d");
    if (!context) continue;
    await page.render({ canvasContext: context, viewport }).promise;
    pages.push(canvas.toDataURL("image/jpeg", 0.82));
  }
  return pages;
}
