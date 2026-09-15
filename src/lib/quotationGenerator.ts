
"use client";

import jsPDF from 'jspdf';
import 'jspdf-autotable'; 
import type { UserOptions, CellWidthType } from 'jspdf-autotable';
import { FirestoreQuotation, CompanyDetailsForPdf, Timestamp } from '@/types/firestore'; // Added Timestamp
import { formatDateInTimezone } from './utils';

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

export const generateQuotationPdf = async (quotation: FirestoreQuotation, companyDetails?: CompanyDetailsForPdf): Promise<string> => {
  const doc = new jsPDF();
  doc.addFileToVFS('Roboto-Regular.ttf', robotoFontBase64);
  doc.addFont('Roboto-Regular.ttf', 'Roboto', 'normal');
  doc.addFont('Roboto-Regular.ttf', 'Roboto', 'bold');
  doc.setFont('Roboto', 'normal');

  const defaultCompanyDetails: CompanyDetailsForPdf = {
    name: companyDetails?.name || process.env.NEXT_PUBLIC_WEBSITE_NAME || "Yourbrand",
    address: companyDetails?.address || "123 Main Street, City, Country - 123456",
    contactEmail: companyDetails?.contactEmail || 'support@yourdomain.com',
    contactMobile: companyDetails?.contactMobile || '+91-7353113455',
    logoUrl: companyDetails?.logoUrl,
    currencySymbol: companyDetails?.currencySymbol || '₹',
  };
  
  // Header Section
  doc.setFontSize(18);
  doc.setFont("Roboto", "bold");
  doc.text(defaultCompanyDetails.name, 14, 22);
  doc.setFontSize(10);
  doc.setFont("Roboto", "normal");
  const addressLines = doc.splitTextToSize(defaultCompanyDetails.address, 100);
  doc.text(addressLines[0], 14, 28);
  if (addressLines.length > 1) doc.text(addressLines[1], 14, 32);
  doc.text(`Email: ${defaultCompanyDetails.contactEmail} | Phone: ${defaultCompanyDetails.contactMobile}`, 14, (addressLines.length > 1 ? 32 : 28) + 6);

  doc.setFontSize(22);
  doc.setFont("Roboto", "bold");
  doc.text("QUOTATION", 196, 22, { align: "right" });
  doc.setFont("Roboto", "normal");

  doc.setFontSize(10);
  const dateFormat = companyDetails?.dateFormat || 'DD/MM/YYYY';
  doc.text(`Quotation #: ${quotation.quotationNumber}`, 196, 30, { align: "right" });
  doc.text(`Date: ${formatDateForIndiaDisplay(quotation.quotationDate, dateFormat)}`, 196, 36, { align: "right" });
  
  // Customer Details Section
  let startYCustomer = 50;
  doc.setFontSize(12);
  doc.setFont("Roboto", "bold");
  doc.text("To:", 14, startYCustomer);
  doc.setFont("Roboto", "normal");
  doc.setFontSize(10);
  startYCustomer += 5; doc.text(quotation.customerName, 14, startYCustomer);
  if (quotation.customerEmail) {
    startYCustomer += 5; doc.text(`Email: ${quotation.customerEmail}`, 14, startYCustomer);
  }
  if (quotation.customerMobile) { // Added customerMobile
    startYCustomer += 5; doc.text(`Mobile: ${quotation.customerMobile}`, 14, startYCustomer);
  }

  // Service Title / Description
  startYCustomer += 10;
  doc.setFontSize(12);
  doc.setFont("Roboto", "bold");
  doc.text("Subject: Quotation for " + quotation.serviceTitle, 14, startYCustomer);
  doc.setFont("Roboto", "normal");
  doc.setFontSize(10);
  if (quotation.serviceDescription) {
    startYCustomer += 6;
    const descLines = doc.splitTextToSize(quotation.serviceDescription, 180);
    doc.text(descLines, 14, startYCustomer);
    startYCustomer += (descLines.length * 4);
  }


  // Items Table
  const tableColumnStyles: { [key: string]: Partial<ExtendedHeadCellDef> } = {
    0: { cellWidth: 10, halign: 'center' }, // #
    1: { cellWidth: 'auto', halign: 'left' }, // Description
    2: { cellWidth: 20, halign: 'center' }, // Qty
    3: { cellWidth: 30, halign: 'right' }, // Rate
    4: { cellWidth: 30, halign: 'right' }, // Amount
  };

  const sym = defaultCompanyDetails.currencySymbol || 'Rs';
  const head = [["#", "Description", "Qty", `Rate (${sym})`, `Amount (${sym})` ]];
  const body = quotation.items.map((item, index) => [
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

  const AlignmentText = (label: string, value: string, y: number) => {
    doc.text(label, 150, y, { align: "right" });
    doc.text(value, 196, y, { align: "right" });
  };

  doc.setFontSize(10);
  AlignmentText("Subtotal:", `${sym} ${quotation.subtotal.toFixed(2)}`, finalY);
  
  if (quotation.taxAmount && quotation.taxAmount > 0) {
    finalY += 5;
    AlignmentText(`Tax (${quotation.taxPercent?.toFixed(1) || ''}%):`, `+ ${sym} ${quotation.taxAmount.toFixed(2)}`, finalY);
  }

  finalY += 7;
  doc.setFontSize(12);
  doc.setFont("Roboto", "bold");
  AlignmentText("Grand Total:", `${sym} ${quotation.totalAmount.toFixed(2)}`, finalY);
  doc.setFont("Roboto", "normal");

  // Additional Notes Section
  if (quotation.additionalNotes) {
    finalY += 10;
    doc.setFontSize(10);
    doc.setFont("Roboto", "bold");
    doc.text("Notes & Terms:", 14, finalY);
    doc.setFont("Roboto", "normal");
    finalY += 5;
    const notesLines = doc.splitTextToSize(quotation.additionalNotes, 180);
    doc.text(notesLines, 14, finalY);
    finalY += (notesLines.length * 4);
  }

  // Footer
  const pageHeight = doc.internal.pageSize.height;
  doc.setFontSize(9);
  doc.text("Thank you for your interest!", 105, pageHeight - 15, { align: "center" });
  doc.text("This is a computer generated quotation.", 105, pageHeight - 10, { align: "center" });

  return doc.output('datauristring'); 
};
