import { useEffect, useRef, useState } from "react";
import * as pdfjsLib from "pdfjs-dist";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, ZoomIn, ZoomOut } from "lucide-react";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

interface Props {
  url: string;
}

/**
 * Renders a PDF directly to canvas via pdf.js instead of embedding it in an
 * <iframe>. The browser's built-in PDF viewer (what an iframe gives you)
 * always brings its own chrome — a toolbar and, more importantly, a
 * page-thumbnail sidebar — and that chrome can't be reliably suppressed
 * across browsers via URL fragment params (#toolbar=0&navpanes=0 is a hint
 * Chrome doesn't consistently honor). At the roughly-half-dialog-width this
 * preview pane gets, that sidebar ate a large share of the already-limited
 * space. Rendering ourselves means there's no sidebar to fight — just the
 * page, filling the pane, with our own minimal prev/next + zoom controls.
 */
export default function PdfPreview({ url }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [pdfDoc, setPdfDoc] = useState<pdfjsLib.PDFDocumentProxy | null>(null);
  const [pageNum, setPageNum] = useState(1);
  const [numPages, setNumPages] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const renderTaskRef = useRef<pdfjsLib.RenderTask | null>(null);

  // Load the document whenever the URL changes.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setPageNum(1);
    setZoom(1);
    pdfjsLib.getDocument(url).promise
      .then((doc) => {
        if (cancelled) return;
        setPdfDoc(doc);
        setNumPages(doc.numPages);
        setLoading(false);
      })
      .catch((e) => {
        if (cancelled) return;
        console.error("[PdfPreview] failed to load PDF:", e);
        setError("Could not load this PDF for preview.");
        setLoading(false);
      });
    return () => { cancelled = true; };
  }, [url]);

  // Render the current page whenever the doc, page number, or zoom changes.
  useEffect(() => {
    if (!pdfDoc || !canvasRef.current) return;
    let cancelled = false;

    (async () => {
      const page = await pdfDoc.getPage(pageNum);
      if (cancelled) return;

      const canvas = canvasRef.current!;
      const context = canvas.getContext("2d");
      if (!context) return;

      // Scale to fill the container's width at the current zoom level,
      // rather than a fixed pixel size, so the page reads clearly at
      // whatever width this pane actually has.
      const containerWidth = containerRef.current?.clientWidth ?? 600;
      const baseViewport = page.getViewport({ scale: 1 });
      const fitScale = (containerWidth - 24) / baseViewport.width;
      const viewport = page.getViewport({ scale: fitScale * zoom });

      canvas.width = viewport.width;
      canvas.height = viewport.height;

      // Cancel any in-flight render before starting a new one (e.g. rapid
      // page-flip clicks) so we don't get pdf.js's "already rendering" error.
      renderTaskRef.current?.cancel();
      const task = page.render({ canvasContext: context, viewport, canvas });
      renderTaskRef.current = task;
      try {
        await task.promise;
      } catch (e: any) {
        if (e?.name !== "RenderingCancelledException") console.error("[PdfPreview] render error:", e);
      }
    })();

    return () => { cancelled = true; };
  }, [pdfDoc, pageNum, zoom]);

  if (error) {
    return <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm px-4 text-center">{error}</div>;
  }

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div ref={containerRef} className="flex-1 overflow-auto flex items-start justify-center p-3">
        {loading ? (
          <div className="flex items-center justify-center h-full text-sm text-muted-foreground">Loading preview…</div>
        ) : (
          <canvas ref={canvasRef} className="shadow-sm border bg-white" />
        )}
      </div>
      {!loading && numPages > 0 && (
        <div className="flex items-center justify-between gap-2 px-3 py-2 border-t bg-background shrink-0">
          <div className="flex items-center gap-1">
            <Button
              variant="ghost" size="icon" className="h-7 w-7"
              disabled={pageNum <= 1} onClick={() => setPageNum((p) => Math.max(1, p - 1))}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-xs text-muted-foreground w-16 text-center">
              {numPages > 1 ? `Page ${pageNum} of ${numPages}` : "1 page"}
            </span>
            <Button
              variant="ghost" size="icon" className="h-7 w-7"
              disabled={pageNum >= numPages} onClick={() => setPageNum((p) => Math.min(numPages, p + 1))}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" className="h-7 w-7" disabled={zoom <= 0.5} onClick={() => setZoom((z) => Math.max(0.5, z - 0.25))}>
              <ZoomOut className="h-3.5 w-3.5" />
            </Button>
            <span className="text-xs text-muted-foreground w-10 text-center">{Math.round(zoom * 100)}%</span>
            <Button variant="ghost" size="icon" className="h-7 w-7" disabled={zoom >= 2.5} onClick={() => setZoom((z) => Math.min(2.5, z + 0.25))}>
              <ZoomIn className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
