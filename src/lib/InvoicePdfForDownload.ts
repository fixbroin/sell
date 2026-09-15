
"use client";

import jsPDF from 'jspdf';
import 'jspdf-autotable'; 
import type { UserOptions, CellWidthType } from 'jspdf-autotable';
import type { FirestoreBooking, BookingServiceItem, AppliedPlatformFeeItem } from '@/types/firestore';
import { formatDateInTimezone } from './utils';
import { robotoFontBase64 } from './pdfFonts';

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

interface CompanyDetails {
  name: string;
  address: string;
  contactEmail: string;
  contactMobile: string;
  logoUrl?: string;
  timezone?: string;
  currencySymbol?: string;
  dateFormat?: string;
}

const getBasePriceForInvoice = (displayedPrice: number, isTaxInclusive?: boolean, taxPercent?: number): number => {
  if (isTaxInclusive && taxPercent && taxPercent > 0) {
    return displayedPrice / (1 + taxPercent / 100);
  }
  return displayedPrice;
};

export const generateInvoicePdf = async (booking: FirestoreBooking, companyDetails?: CompanyDetails): Promise<string> => {
  const doc = new jsPDF();
  doc.addFileToVFS('Roboto-Regular.ttf', robotoFontBase64);
  doc.addFont('Roboto-Regular.ttf', 'Roboto', 'normal');
  doc.addFont('Roboto-Regular.ttf', 'Roboto', 'bold');
  doc.setFont('Roboto', 'normal');

  const timezone = companyDetails?.timezone || 'Asia/Kolkata';
  const sym = companyDetails?.currencySymbol || '₹';

  const defaultCompanyDetails: CompanyDetails = {
    name: companyDetails?.name || "Yourbrand.in",
    address: companyDetails?.address || "123 Main Street, City, Country - 123456",
    contactEmail: companyDetails?.contactEmail || 'support@yourdomain.com',
    contactMobile: companyDetails?.contactMobile || '+91-7353113455',
    logoUrl: companyDetails?.logoUrl,
    timezone: timezone
  };
  
  doc.setFontSize(18);
  doc.setFont("Roboto", "bold");
  doc.text(defaultCompanyDetails.name, 14, 22);
  doc.setFontSize(10);
  doc.setFont("Roboto", "normal");
  const addressLines = doc.splitTextToSize(defaultCompanyDetails.address, 100);
  doc.text(addressLines[0], 14, 28);
  if (addressLines.length > 1) doc.text(addressLines[1], 14, 34); else if (addressLines.length === 1 && addressLines[0].length > 50) { /* Handle single long line if needed*/ } // Adjusted for potentially shorter second line
  doc.text(`Email: ${defaultCompanyDetails.contactEmail} | Phone: ${defaultCompanyDetails.contactMobile}`, 14, (addressLines.length > 1 ? 34 : 28) + 6);


  doc.setFontSize(22);
  doc.setFont("Roboto", "bold");
  doc.text("INVOICE", 196, 22, { align: "right" });
  doc.setFont("Roboto", "normal");

  doc.setFontSize(10);
  doc.text(`Invoice #: ${booking.bookingId}`, 196, 30, { align: "right" });
  const dateFormat = companyDetails?.dateFormat || 'DD/MM/YYYY';
  doc.text(`Date: ${formatDateInTimezone(new Date(), timezone, dateFormat)}`, 196, 36, { align: "right" });
  
  // Format scheduledDate correctly
  let displayScheduledDate = booking.scheduledDate || 'N/A';
  if (booking.scheduledDate && booking.scheduledDate.includes('-')) {
      const [y, m, d] = booking.scheduledDate.split('-').map(Number);
      const dateObj = new Date(y, m - 1, d);
      displayScheduledDate = formatDateInTimezone(dateObj, timezone, dateFormat);
  }
  doc.text(`Service Date: ${displayScheduledDate}`, 196, 42, { align: "right" });

  let startYCustomer = 55;
  doc.setFontSize(12);
  doc.setFont("Roboto", "bold");
  doc.text("Bill To:", 14, startYCustomer);
  doc.setFont("Roboto", "normal");
  doc.setFontSize(10);
  startYCustomer += 6; doc.text(booking.customerName, 14, startYCustomer);
  startYCustomer += 6; doc.text(booking.addressLine1, 14, startYCustomer);
  if (booking.addressLine2) { startYCustomer += 6; doc.text(booking.addressLine2, 14, startYCustomer); }
  startYCustomer += 6; doc.text(`${booking.city}, ${booking.state} - ${booking.pincode}`, 14, startYCustomer);
  startYCustomer += 6; doc.text(`Email: ${booking.customerEmail}`, 14, startYCustomer);
  startYCustomer += 6; doc.text(`Phone: ${booking.customerPhone}`, 14, startYCustomer);

  const hasTax = (booking.taxAmount && booking.taxAmount > 0) || 
                 booking.services.some(item => (item.taxPercentApplied && item.taxPercentApplied > 0)) ||
                 (booking.appliedPlatformFees && booking.appliedPlatformFees.some(fee => fee.taxRatePercentOnFee > 0));

  const tableColumnStyles: { [key: string]: Partial<ExtendedHeadCellDef> } = hasTax ? {
    0: { cellWidth: 10, halign: 'center' }, 1: { cellWidth: 'auto', halign: 'left' }, 2: { cellWidth: 15, halign: 'center' },
    3: { cellWidth: 30, halign: 'right' }, 4: { cellWidth: 20, halign: 'center' },
    5: { cellWidth: 30, halign: 'right' }, 6: { cellWidth: 30, halign: 'right' },
  } : {
    0: { cellWidth: 10, halign: 'center' }, 1: { cellWidth: 'auto', halign: 'left' }, 2: { cellWidth: 15, halign: 'center' },
    3: { cellWidth: 35, halign: 'right' }, 4: { cellWidth: 35, halign: 'right' },
  };

  const head = hasTax 
    ? [["#", "Description", "Qty", `Unit Price (${sym})`, "Tax %", `Tax Amt (${sym})`, `Total (${sym})` ]]
    : [["#", "Description", "Qty", `Unit Price (${sym})`, `Total (${sym})` ]];

  const body = booking.services.map((item, index) => {
    const baseUnitPrice = getBasePriceForInvoice(item.pricePerUnit, item.isTaxInclusive, item.taxPercentApplied);
    const lineItemTotalWithTax = (baseUnitPrice * item.quantity) + (item.taxAmountForItem || 0);

    return hasTax ? [
      (index + 1).toString(),
      item.name + (item.isTaxInclusive ? " (incl. tax)" : ""),
      item.quantity.toString(),
      baseUnitPrice.toFixed(2),
      (item.taxPercentApplied || 0).toFixed(1) + "%",
      (item.taxAmountForItem || 0).toFixed(2),
      lineItemTotalWithTax.toFixed(2),
    ] : [
      (index + 1).toString(),
      item.name + (item.isTaxInclusive ? " (incl. tax)" : ""),
      item.quantity.toString(),
      baseUnitPrice.toFixed(2),
      lineItemTotalWithTax.toFixed(2),
    ];
  });

  if (booking.appliedPlatformFees && booking.appliedPlatformFees.length > 0) {
    booking.appliedPlatformFees.forEach((fee, index) => {
      body.push(hasTax ? [
        (booking.services.length + index + 1).toString(),
        fee.name + (fee.taxRatePercentOnFee > 0 ? ` (incl. ${fee.taxRatePercentOnFee}% tax on fee)` : ""),
        "1",
        fee.calculatedFeeAmount.toFixed(2),
        fee.taxRatePercentOnFee.toFixed(1) + "%",
        fee.taxAmountOnFee.toFixed(2),
        (fee.calculatedFeeAmount + fee.taxAmountOnFee).toFixed(2),
      ] : [
        (booking.services.length + index + 1).toString(),
        fee.name + (fee.taxRatePercentOnFee > 0 ? ` (incl. ${fee.taxRatePercentOnFee}% tax on fee)` : ""),
        "1",
        fee.calculatedFeeAmount.toFixed(2),
        (fee.calculatedFeeAmount + fee.taxAmountOnFee).toFixed(2),
      ]);
    });
  }

// ✅ ADDITIONAL SERVICES SUPPORT (Extra Charges)
if (booking.additionalCharges && booking.additionalCharges.length > 0) {
  const startIndex =
    booking.services.length +
    (booking.appliedPlatformFees?.length || 0);

  booking.additionalCharges.forEach((charge, index) => {
    body.push(hasTax ? [
      (startIndex + index + 1).toString(),
      charge.name + " (Extra Service/Part)",
      "1",
      charge.amount.toFixed(2),
      "0.0%",
      "0.00",
      charge.amount.toFixed(2),
    ] : [
      (startIndex + index + 1).toString(),
      charge.name + " (Extra Service/Part)",
      "1",
      charge.amount.toFixed(2),
      charge.amount.toFixed(2),
    ]);
  });
}

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

  let finalY = doc.lastAutoTable.finalY || startYCustomer + 10 + (body.length + 1) * 10;
  finalY += 10;

  const drawRightAlignedText = (label: string, value: string, y: number) => {
    doc.text(label, 145, y, { align: "right" });
    doc.text(value, 196, y, { align: "right" });
  };

  doc.setFontSize(10);
  drawRightAlignedText("Items Subtotal (Base):", `${sym} ${booking.subTotal.toFixed(2)}`, finalY);

  if (booking.discountAmount && booking.discountAmount > 0) {
    finalY += 6;
    drawRightAlignedText(`Discount (${booking.discountCode || 'Applied'}):`, `- ${sym} ${booking.discountAmount.toFixed(2)}`, finalY);
  }
  
  if (booking.visitingCharge && booking.visitingCharge > 0) {
    finalY += 6;
    drawRightAlignedText("Visiting Charge (Base):", `+ ${sym} ${booking.visitingCharge.toFixed(2)}`, finalY);
  }

  const totalBasePlatformFees = booking.appliedPlatformFees?.reduce((sum, fee) => sum + fee.calculatedFeeAmount, 0) || 0;
  if (totalBasePlatformFees > 0) {
    finalY += 6;
    drawRightAlignedText("Platform Fees (Base):", `+ ${sym} ${totalBasePlatformFees.toFixed(2)}`, finalY);
  }

  // ✅ Additional Charges (On-Site) summary support
  if (booking.additionalCharges && booking.additionalCharges.length > 0) {
    const extraTotal = booking.additionalCharges.reduce((sum, c) => sum + c.amount, 0);
    if (extraTotal > 0) {
      finalY += 6;
      drawRightAlignedText("Additional Charges:", `+ ${sym} ${extraTotal.toFixed(2)}`, finalY);
    }
  }

  if (booking.taxAmount && booking.taxAmount > 0) {
    finalY += 6;
    drawRightAlignedText("Total Tax:", `+ ${sym} ${booking.taxAmount.toFixed(2)}`, finalY);
  }

  finalY += 8;
  doc.setFontSize(12);
  doc.setFont("Roboto", "bold");
  drawRightAlignedText("Total Amount Due:", `${sym} ${booking.totalAmount.toFixed(2)}`, finalY);
  doc.setFont("Roboto", "normal");

  finalY += 10;
  doc.setFontSize(10);
  doc.text(`Payment Method: ${booking.paymentMethod}`, 14, finalY);
  if (booking.razorpayPaymentId) {
    finalY += 6;
    doc.text(`Payment ID: ${booking.razorpayPaymentId}`, 14, finalY);
  } else if (booking.stripePaymentIntent || booking.stripeSessionId) {
    finalY += 6;
    doc.text(`Payment ID: ${booking.stripePaymentIntent || booking.stripeSessionId}`, 14, finalY);
  }

  const pageHeight = doc.internal.pageSize.height;
  doc.setFontSize(10);
  doc.text("Thank you for choosing " + defaultCompanyDetails.name + "!", 105, pageHeight - 15, { align: "center" });
  doc.text("This is a computer generated invoice and does not require a signature.", 105, pageHeight - 10, { align: "center" });

  doc.save(`invoice-${booking.bookingId}.pdf`); 
  return "success";
};
