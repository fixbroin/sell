"use client";

import jsPDF from 'jspdf';
import 'jspdf-autotable';
import type { UserOptions } from 'jspdf-autotable';
import type { ProviderApplication, KycDocument, BankDetails, CompanyDetailsForPdf } from '@/types/firestore';
import { Timestamp } from '@/lib/mysqlDb';
import { formatDateInTimezone } from './utils';

declare module 'jspdf' {
  interface jsPDF {
    autoTable: (options: UserOptions) => jsPDF;
    lastAutoTable: { finalY: number };
  }
}

const formatTimestampToReadable = (timestamp?: Timestamp | Date | string): string => {
  if (!timestamp) return "N/A";
  let date: Date;
  if (timestamp instanceof Timestamp) {
    date = timestamp.toDate();
  } else if (timestamp instanceof Date) {
    date = timestamp;
  } else {
    try {
      date = new Date(timestamp);
      if (isNaN(date.getTime())) throw new Error("Invalid date string");
    } catch (e) {
      return String(timestamp); // Fallback
    }
  }
  return formatDateInTimezone(date, 'Asia/Kolkata');
};

// Colors matching Yourbrand theme (Teal/Dark Gray)
const primaryColor = { r: 20, g: 110, b: 120 }; // Teal
const secondaryColor = { r: 100, g: 110, b: 120 }; // Gray
const textColor = { r: 30, g: 41, b: 59 }; // Slate

const addSectionTitle = (doc: jsPDF, title: string, yPos: number): number => {
  doc.setFontSize(13);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(primaryColor.r, primaryColor.g, primaryColor.b);
  doc.text(title, 14, yPos);
  
  // Draw a border line below the section header
  doc.setDrawColor(primaryColor.r, primaryColor.g, primaryColor.b);
  doc.setLineWidth(0.5);
  doc.line(14, yPos + 2, 196, yPos + 2);
  
  doc.setFont("helvetica", "normal");
  doc.setTextColor(textColor.r, textColor.g, textColor.b);
  doc.setFontSize(11);
  return yPos + 10;
};

const addDetail = (doc: jsPDF, label: string, value: string | string[] | undefined | null, yPos: number): number => {
  if (value === undefined || value === null || (Array.isArray(value) && value.length === 0)) {
    value = "N/A";
  }
  const valStr = Array.isArray(value) ? value.join(', ') : String(value);
  
  // Set bold for label (increased size to 11)
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(textColor.r, textColor.g, textColor.b);
  doc.text(`${label}: `, 14, yPos);
  
  const labelWidth = doc.getTextWidth(`${label}: `);
  
  // Set normal for value (increased size to 11)
  doc.setFont("helvetica", "normal");
  doc.setTextColor(textColor.r, textColor.g, textColor.b);
  const splitValue = doc.splitTextToSize(valStr, 180 - labelWidth);
  doc.text(splitValue, 14 + labelWidth, yPos);
  
  const rowHeight = (splitValue.length * 5) + 3;
  const nextY = yPos + rowHeight;

  // Draw a light horizontal separator line below this row
  doc.setDrawColor(220, 225, 230);
  doc.setLineWidth(0.3);
  doc.line(14, nextY - 1, 196, nextY - 1);
  
  return nextY + 3; // Spacing for the next item
};

async function getImageDataUri(url: string): Promise<{ dataUri: string; format: string } | null> {
  if (!url) return null;

  let targetUrl = url;
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    if (typeof window !== 'undefined') {
      targetUrl = window.location.origin + (url.startsWith('/') ? url : '/' + url);
    }
  }

  try {
    const response = await fetch(targetUrl);
    if (!response.ok) {
      console.warn(`Failed to fetch image from ${targetUrl}: ${response.statusText}`);
      return null;
    }
    const blob = await response.blob();
    const format = blob.type.split('/')[1]?.toUpperCase() || 'JPEG'; // e.g., JPEG, PNG
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve({ dataUri: reader.result as string, format });
      reader.onerror = (error) => {
        console.error(`FileReader error for ${url}:`, error);
        reject(null);
      };
      reader.readAsDataURL(blob);
    });
  } catch (error) {
    console.error(`Error fetching or converting image ${url}:`, error);
    return null;
  }
}

const checkAndAddPage = (doc: jsPDF, currentY: number, neededHeight: number): number => {
  const pageHeight = doc.internal.pageSize.height;
  const bottomMargin = 20;
  if (currentY + neededHeight > pageHeight - bottomMargin) {
    doc.addPage();
    return 20; // New page yStart
  }
  return currentY;
};

const addImageToPdf = async (
  doc: jsPDF,
  imageUrl: string | undefined | null,
  label: string,
  currentY: number,
  imageWidthMm = 160, 
  imageMaxHeightMm = 110
): Promise<number> => {
  let newY = currentY;
  if (imageUrl) {
    newY = checkAndAddPage(doc, newY, imageMaxHeightMm + 10); 
    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.text(label, 14, newY);
    doc.setFont("helvetica", "normal");
    newY += 4;
    const imageData = await getImageDataUri(imageUrl);
    if (imageData) {
      try {
        const imgProps = doc.getImageProperties(imageData.dataUri);
        const aspectRatio = imgProps.width / imgProps.height;
        let pdfImgWidth = imageWidthMm;
        let pdfImgHeight = imageWidthMm / aspectRatio;

        if (pdfImgHeight > imageMaxHeightMm) {
          pdfImgHeight = imageMaxHeightMm;
          pdfImgWidth = imageMaxHeightMm * aspectRatio;
        }
        newY = checkAndAddPage(doc, newY, pdfImgHeight + 2); 
        doc.addImage(imageData.dataUri, imageData.format, 14, newY, pdfImgWidth, pdfImgHeight);
        newY += pdfImgHeight + 5; 
      } catch (e) {
        console.error(`Error adding image ${label} to PDF:`, e);
        doc.setFont("helvetica", "oblique");
        doc.text(`(Image for ${label} could not be loaded)`, 14, newY);
        doc.setFont("helvetica", "normal");
        newY += 5;
      }
    } else {
      doc.setFont("helvetica", "oblique");
      doc.text(`(Image for ${label} not available or failed to load)`, 14, newY);
      doc.setFont("helvetica", "normal");
      newY += 5;
    }
  } else {
    newY = checkAndAddPage(doc, newY, 10);
    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.text(`${label}: `, 14, newY);
    const labelWidth = doc.getTextWidth(`${label}: `);
    doc.setFont("helvetica", "normal");
    doc.text("Not provided", 14 + labelWidth, newY);
    newY += 5;
  }
  return newY;
};


export const generateProviderApplicationPdf = async (
  application: ProviderApplication,
  companyDetails?: CompanyDetailsForPdf,
  customFieldsConfig?: any[]
): Promise<string> => {
  const doc = new jsPDF();
  let y = 22;

  const defaultCompanyDetails: CompanyDetailsForPdf = {
    name: companyDetails?.name || "Yourbrand.in",
    address: companyDetails?.address || "Company Address Placeholder",
    contactEmail: companyDetails?.contactEmail || 'support@example.com',
    contactMobile: companyDetails?.contactMobile || '+91-XXXXXXXXXX',
    logoUrl: companyDetails?.logoUrl,
  };

  // Company Header
  doc.setFontSize(18);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(primaryColor.r, primaryColor.g, primaryColor.b);
  doc.text(defaultCompanyDetails.name, 14, y);
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(textColor.r, textColor.g, textColor.b);
  y += 6;
  const addressLines = doc.splitTextToSize(defaultCompanyDetails.address, 90);
  doc.text(addressLines, 14, y);
  y += (addressLines.length * 4) + 2;
  doc.text(`Email: ${defaultCompanyDetails.contactEmail} | Phone: ${defaultCompanyDetails.contactMobile}`, 14, y);

  doc.setFontSize(15);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(primaryColor.r, primaryColor.g, primaryColor.b);
  doc.text("Provider Registration File", 196, y - 10, { align: "right" });
  y += 6;
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(textColor.r, textColor.g, textColor.b);

  doc.text(`Application ID: ${application.id || 'N/A'}`, 196, y - 4, { align: "right" });
  doc.text(`Status: ${application.status.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}`, 196, y + 1, { align: "right" });
  
  // Separation Line under Company Header
  y += 6;
  doc.setDrawColor(200);
  doc.setLineWidth(0.5);
  doc.line(14, y, 196, y);
  y += 10;

  // Section 1: Personal Information
  y = checkAndAddPage(doc, y, 40);
  y = addSectionTitle(doc, "1. Personal Information", y);
  if (application.profilePhotoUrl) {
    y = await addImageToPdf(doc, application.profilePhotoUrl, "Profile Photo", y, 100, 100);
  }
  y = addDetail(doc, "Full Name", application.fullName, y);
  y = addDetail(doc, "Email Address", application.email, y);
  y = addDetail(doc, "Mobile Number", application.mobileNumber, y);
  y = addDetail(doc, "Alternate Mobile", application.alternateMobile, y);
  y = addDetail(doc, "Current Address", application.address, y);
  y = addDetail(doc, "Age", application.age?.toString(), y);
  y = addDetail(doc, "Educational Qualification", application.qualificationLabel, y);
  y = addDetail(doc, "Languages Spoken", application.languagesSpokenLabels, y);
  y += 7;

  // Section 2: Work Information
  y = checkAndAddPage(doc, y, 30);
  y = addSectionTitle(doc, "2. Work & Service Category Details", y);
  y = addDetail(doc, "Primary Work Category", application.workCategoryName, y);
  y = addDetail(doc, "Experience Level", application.experienceLevelLabel, y);
  y = addDetail(doc, "Skill Level", application.skillLevelLabel, y);
  if (application.bio) {
    y = checkAndAddPage(doc, y, 15);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.text("Professional Bio:", 14, y);
    doc.setFont("helvetica", "normal");
    y += 5;
    const bioLines = doc.splitTextToSize(application.bio, 180);
    doc.text(bioLines, 14, y);
    y += (bioLines.length * 5) + 5;
  }
  y += 7;

  // Section 3: KYC Documents
  y = checkAndAddPage(doc, y, 30);
  y = addSectionTitle(doc, "3. Identity Verification & KYC Documents", y);
  
  y = addDetail(doc, "Aadhaar Card Number", application.aadhaar?.docNumber, y);
  y = await addImageToPdf(doc, application.aadhaar?.frontImageUrl, "Aadhaar Document - Front Side", y);
  y = await addImageToPdf(doc, application.aadhaar?.backImageUrl, "Aadhaar Document - Back Side", y);
  y = addDetail(doc, "Aadhaar Verification Status", application.aadhaar?.verified ? "Verified" : "Pending Verification", y);
  y += 5;

  y = addDetail(doc, "Permanent Account Number (PAN)", application.pan?.docNumber, y);
  y = await addImageToPdf(doc, application.pan?.frontImageUrl, "PAN Card Document - Front Side", y);
  y = addDetail(doc, "PAN Verification Status", application.pan?.verified ? "Verified" : "Pending Verification", y);
  y += 7;

  if (application.additionalDocuments && application.additionalDocuments.length > 0) {
    y = checkAndAddPage(doc, y, 15);
    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(primaryColor.r, primaryColor.g, primaryColor.b);
    doc.text("Additional Uploaded Documents:", 14, y);
    doc.setFontSize(11);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(textColor.r, textColor.g, textColor.b);
    y += 6;
    for (const optDoc of application.additionalDocuments) {
      y = checkAndAddPage(doc, y, 15);
      y = addDetail(doc, optDoc.docLabel || optDoc.docType || "Document Name", optDoc.docNumber, y);
      y = await addImageToPdf(doc, optDoc.frontImageUrl, `${optDoc.docLabel || optDoc.docType || "Document"} - Front Side`, y);
      y = await addImageToPdf(doc, optDoc.backImageUrl, `${optDoc.docLabel || optDoc.docType || "Document"} - Back Side`, y);
      y = addDetail(doc, `${optDoc.docLabel || optDoc.docType || "Document"} Verification Status`, optDoc.verified ? "Verified" : "Pending Verification", y);
      y += 5;
    }
    y += 2;
  }

  // Section 4: Work Location & Bank Details
  y = checkAndAddPage(doc, y, 30);
  y = addSectionTitle(doc, "4. Service Area & Bank Details", y);
  if (application.workAreaAddress) {
    y = addDetail(doc, "Work Location / Zone", application.workAreaAddress, y);
  }
  y = addDetail(doc, "Work Area Center (Lat, Long)", application.workAreaCenter ? `${application.workAreaCenter.latitude.toFixed(6)}, ${application.workAreaCenter.longitude.toFixed(6)}` : "N/A", y);
  y = addDetail(doc, "Service Radius (Kilometers)", application.workAreaRadiusKm ? `${application.workAreaRadiusKm} km` : "N/A", y);
  y += 4; 

  if (application.bankDetails) {
    const bank = application.bankDetails;
    y = addDetail(doc, "Bank Name", bank.bankName, y);
    y = addDetail(doc, "Account Holder Name", bank.accountHolderName, y);
    y = addDetail(doc, "Account Number", bank.accountNumber, y);
    
    if (bank.customFields && Object.keys(bank.customFields).length > 0) {
      for (const [key, val] of Object.entries(bank.customFields)) {
        const fieldCfg = customFieldsConfig?.find(f => f.id === key);
        const formattedLabel = fieldCfg?.name || (key === 'ifsc' ? 'IFSC Code' : key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase()));
        y = addDetail(doc, formattedLabel, val, y);
      }
    } else {
      y = addDetail(doc, "IFSC Code", bank.ifscCode, y);
    }
    
    y = await addImageToPdf(doc, bank.cancelledChequeUrl, "Cancelled Cheque / Passbook Image", y);
    y = addDetail(doc, "Bank Account Status", bank.verified ? "Verified" : "Pending Verification", y);
  } else {
    y = addDetail(doc, "Bank Details", "Not Provided", y);
  }
  y += 7;

  // Section 5: Consent & Declaration
  y = checkAndAddPage(doc, y, 70);
  y = addSectionTitle(doc, "5. Declarations & Agreements", y);
  
  doc.setFontSize(9.5);
  doc.setTextColor(secondaryColor.r, secondaryColor.g, secondaryColor.b);
  const consentText = `I, ${application.fullName || 'the applicant'}, hereby declare that I have read, understood, and agreed to the Terms and Conditions of Yourbrand.in. I confirm that all information provided in this application is true and accurate to the best of my knowledge. I understand that any false information may lead to the rejection of my application or termination of my partnership. I provide my digital consent below as a formal agreement.`;
  const splitConsent = doc.splitTextToSize(consentText, 180);
  doc.text(splitConsent, 14, y);
  y += (splitConsent.length * 5) + 5;

  doc.setTextColor(textColor.r, textColor.g, textColor.b);
  if (application.termsConfirmedAt) {
    y = addDetail(doc, "Agreed & Certified On", formatTimestampToReadable(application.termsConfirmedAt), y);
  }

  y = await addImageToPdf(doc, application.signatureUrl, "Digital Signature Image", y, 100, 100);
  y += 7;

  // Section 6: Admin Notes
  if (application.adminReviewNotes) {
    y = checkAndAddPage(doc, y, 20);
    y = addSectionTitle(doc, "6. Admin Review Notes", y);
    const notesLines = doc.splitTextToSize(application.adminReviewNotes, 180);
    doc.text(notesLines, 14, y);
    y += (notesLines.length * 5) + 5;
  }

  // Footer Metadata
  doc.setFontSize(8.5);
  doc.setTextColor(160);
  y = checkAndAddPage(doc, y, 12);
  if (application.createdAt) {
    doc.text(`Application Submitted Date: ${formatTimestampToReadable(application.createdAt)}`, 14, y);
    y += 4;
  }
  if (application.updatedAt) {
    y = checkAndAddPage(doc, y, 5);
    doc.text(`Last Administrative Update: ${formatTimestampToReadable(application.updatedAt)}`, 14, y);
  }

  // Pagination Draw
  const pageCount = (doc.internal as any).getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8.5);
    doc.setTextColor(140);
    doc.text(`Page ${i} of ${pageCount}`, doc.internal.pageSize.width - 25, doc.internal.pageSize.height - 10);
    doc.text(`Generated automatically by ${defaultCompanyDetails.name} System.`, 14, doc.internal.pageSize.height - 10);
  }

  return doc.output('datauristring');
};
