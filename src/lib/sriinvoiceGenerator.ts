
"use client";

import jsPDF from 'jspdf';
import 'jspdf-autotable'; 
import type { UserOptions, CellWidthType } from 'jspdf-autotable';
import { FirestoreInvoice, CompanyDetailsForPdf, Timestamp } from '@/types/firestore'; 
import { formatDateInTimezone } from './utils';

// Define ExtendedHeadCellDef if not globally available, or import if it is
// For this example, assuming it's implicitly handled by UserOptions or not strictly needed
// If you have custom cell definitions beyond UserOptions, define them here.
interface ExtendedHeadCellDef {
    cellWidth?: CellWidthType;
    halign?: 'left' | 'center' | 'right';
}

declare module 'jspdf' {
  interface jsPDF {
    autoTable: (options: UserOptions) => jsPDF;
    lastAutoTable: { finalY: number }; 
  }
}

import { robotoFontBase64 } from './pdfFonts';

const formatDateForIndiaDisplay = (timestamp?: Timestamp, dateFormat?: string): string => {
    if (!timestamp) return 'N/A';
    try {
        const date = timestamp.toDate();
        return formatDateInTimezone(date, 'Asia/Kolkata', dateFormat);
    } catch (e) {
        return 'Invalid Date'; 
    }
};

// Changed function name and parameter type to FirestoreInvoice
export const generateInvoicePdf = async (invoice: FirestoreInvoice, companyDetails?: CompanyDetailsForPdf): Promise<string> => {
  const doc = new jsPDF();
  doc.addFileToVFS('Roboto-Regular.ttf', robotoFontBase64);
  doc.addFont('Roboto-Regular.ttf', 'Roboto', 'normal');
  doc.addFont('Roboto-Regular.ttf', 'Roboto', 'bold');
  doc.setFont('Roboto', 'normal');

  const sym = companyDetails?.currencySymbol || '₹';

  const defaultCompanyDetails: CompanyDetailsForPdf = {
    name: companyDetails?.name || process.env.NEXT_PUBLIC_WEBSITE_NAME || "Yourbrand",
    address: companyDetails?.address || "123 Main Street, City, Country - 123456",
    contactEmail: companyDetails?.contactEmail || 'support@yourdomain.com',
    contactMobile: companyDetails?.contactMobile || '+91-7353113455',
    logoUrl: companyDetails?.logoUrl, // Can be undefined
  };
  
  // Header Section
  doc.setFontSize(18);
  doc.setFont("Roboto", "bold");
  doc.text(defaultCompanyDetails.name, 14, 22);
  doc.setFontSize(10);
  doc.setFont("Roboto", "normal");
  const addressLines = doc.splitTextToSize(defaultCompanyDetails.address, 100);
  doc.text(addressLines[0], 14, 28);
  if (addressLines.length > 1) doc.text(addressLines[1], 14, 32); // Adjusted Y for closer spacing
  doc.text(`Email: ${defaultCompanyDetails.contactEmail} | Phone: ${defaultCompanyDetails.contactMobile}`, 14, (addressLines.length > 1 ? 32 : 28) + 6);


  doc.setFontSize(22);
  doc.setFont("Roboto", "bold");
  doc.text("INVOICE", 196, 22, { align: "right" });
  doc.setFont("Roboto", "normal");

  doc.setFontSize(10);
  const dateFormat = companyDetails?.dateFormat || 'DD/MM/YYYY';
  doc.text(`Invoice #: ${invoice.invoiceNumber}`, 196, 30, { align: "right" });
  doc.text(`Date: ${formatDateForIndiaDisplay(invoice.invoiceDate, dateFormat)}`, 196, 36, { align: "right" });
  if (invoice.dueDate) {
    doc.text(`Due Date: ${formatDateForIndiaDisplay(invoice.dueDate, dateFormat)}`, 196, 42, { align: "right" });
  }

  // Customer Details Section
  let startYCustomer = invoice.dueDate ? 50 : 45; // Adjust based on whether due date is present
  doc.setFontSize(12);
  doc.setFont("Roboto", "bold");
  doc.text("Bill To:", 14, startYCustomer);
  doc.setFont("Roboto", "normal");
  doc.setFontSize(10);
  startYCustomer += 5; doc.text(invoice.customerName, 14, startYCustomer);
  // Assuming invoice might not always have full address breakdown like booking
  // For now, just name, email. Add more if your FirestoreInvoice has more fields.
  if (invoice.customerEmail) {
    startYCustomer += 5; doc.text(`Email: ${invoice.customerEmail}`, 14, startYCustomer);
  }
  if (invoice.customerMobile) { // Added customerMobile
    startYCustomer += 5; doc.text(`Mobile: ${invoice.customerMobile}`, 14, startYCustomer);
  }

  // Items Table
  const tableColumnStyles: { [key: string]: Partial<ExtendedHeadCellDef> } = {
    0: { cellWidth: 10, halign: 'center' }, // #
    1: { cellWidth: 'auto', halign: 'left' }, // Description
    2: { cellWidth: 20, halign: 'center' }, // Qty
    3: { cellWidth: 30, halign: 'right' }, // Rate
    4: { cellWidth: 30, halign: 'right' }, // Amount
  };

  const head = [["#", "Description", "Qty", `Rate (${sym})`, `Amount (${sym})` ]];
  const body = invoice.items.map((item, index) => [
    (index + 1).toString(),
    item.itemName,
    item.quantity.toString(),
    item.ratePerUnit.toFixed(2),
    item.total.toFixed(2),
  ]);

  doc.autoTable({
    head: head, 
    body: body, 
    startY: startYCustomer + 10, 
    theme: 'grid',
    headStyles: { fillColor: [70, 160, 162] }, 
    columnStyles: tableColumnStyles,
    styles: { 
      font: 'Roboto',
      lineColor: [220, 220, 220],
      lineWidth: 0.1
    },
  });

  // Totals Section
  let finalY = doc.lastAutoTable.finalY || startYCustomer + 10 + (body.length + 1) * 10;
  finalY += 7;

  const drawRightAlignedText = (label: string, value: string, y: number) => {
    doc.text(label, 150, y, { align: "right" }); // Adjusted x-position for potentially wider labels
    doc.text(value, 196, y, { align: "right" });
  };

  doc.setFontSize(10);
  drawRightAlignedText("Subtotal:", `${sym} ${invoice.subtotal.toFixed(2)}`, finalY);

  if (invoice.discountAmount && invoice.discountAmount > 0) {
    finalY += 5;
    drawRightAlignedText(`Discount (${invoice.discountPercent?.toFixed(1) || ''}%):`, `- ${sym} ${invoice.discountAmount.toFixed(2)}`, finalY);
  }
  
  if (invoice.taxAmount && invoice.taxAmount > 0) {
    finalY += 5;
    drawRightAlignedText(`Tax (${invoice.taxPercent?.toFixed(1) || ''}%):`, `+ ${sym} ${invoice.taxAmount.toFixed(2)}`, finalY);
  }

  finalY += 7;
  doc.setFontSize(12);
  doc.setFont("Roboto", "bold");
  drawRightAlignedText("Grand Total:", `${sym} ${invoice.totalAmount.toFixed(2)}`, finalY);
  doc.setFont("Roboto", "normal");

  if (invoice.amountPaid && invoice.amountPaid > 0) {
    finalY += 5;
    doc.setFontSize(10);
    drawRightAlignedText("Amount Paid:", `${sym} ${invoice.amountPaid.toFixed(2)}`, finalY);
    if (invoice.amountDue && invoice.amountDue !== invoice.totalAmount) { // Show due only if different from total or if paid
      finalY += 5;
      doc.setFont("Roboto", "bold");
      drawRightAlignedText("Amount Due:", `${sym} ${invoice.amountDue.toFixed(2)}`, finalY);
      doc.setFont("Roboto", "normal");
    }
  }

  // Payment & Notes Section
  finalY += 7;
  doc.setFontSize(10);
  doc.text(`Payment Status: ${invoice.paymentStatus}`, 14, finalY);
  if (invoice.paymentMode) {
    finalY += 5;
    doc.text(`Payment Mode: ${invoice.paymentMode}`, 14, finalY);
  }
  if (invoice.paymentNotes) {
    finalY += 5;
    const paymentNotesLines = doc.splitTextToSize(`Payment Notes: ${invoice.paymentNotes}`, 180);
    doc.text(paymentNotesLines, 14, finalY);
    finalY += (paymentNotesLines.length * 4); 
  }
  if (invoice.additionalNotes) {
    finalY += 5;
    doc.setFont("Roboto", "bold");
    doc.text("Additional Notes:", 14, finalY);
    doc.setFont("Roboto", "normal");
    finalY += 5;
    const additionalNotesLines = doc.splitTextToSize(invoice.additionalNotes, 180);
    doc.text(additionalNotesLines, 14, finalY);
    finalY += (additionalNotesLines.length * 4);
  }

  // Footer
  const pageHeight = doc.internal.pageSize.height;
  doc.setFontSize(9);
  doc.text("Thank you for your business!", 105, pageHeight - 15, { align: "center" });
  doc.text("This is a computer generated invoice.", 105, pageHeight - 10, { align: "center" });

  return doc.output('datauristring'); 
};
