"use client";

import { FileDown } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Export PDF via dialog print browser (Save as PDF) — tanpa dependency berat.
 * Print CSS di globals.css menyembunyikan sidebar/topbar & elemen [data-print-hide].
 */
export function PdfButton({ label = "Download PDF" }: { label?: string }) {
  return (
    <Button size="sm" onClick={() => window.print()} data-print-hide>
      <FileDown className="h-4 w-4" aria-hidden="true" />
      {label}
    </Button>
  );
}
