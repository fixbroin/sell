import { getBaseUrl } from './config';

export const createHtmlTemplate = (title: string, bodyContent: string, siteName: string, logoUrl?: string) => {
  let finalLogoUrl = logoUrl || `${getBaseUrl()}/default-image.png`;
  if (finalLogoUrl.startsWith('/')) {
    finalLogoUrl = getBaseUrl() + finalLogoUrl;
  }
  return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <style>
        body { margin: 0; padding: 0; background-color: #F8F9FA; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; }
        .container { max-width: 600px; margin: 0 auto; background-color: #ffffff; }
        .inner-container { padding: 25px; }
        .header { text-align: center; padding: 20px 0; border-bottom: 1px solid #f0f0f0; }
        .header img { max-width: 140px; height: auto; }
        .content { padding: 25px 0; color: #333333; line-height: 1.6; }
        .content h2 { color: #111111; font-size: 22px; margin-bottom: 15px; }
        .footer { text-align: center; font-size: 12px; color: #999999; padding: 25px; border-top: 1px solid #eeeeee; }
        .button {
            display: inline-block; padding: 14px 28px; background-color: #0B5ED7; color: #ffffff !important;
            text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 16px; margin-top: 20px;
        }
        @media only screen and (max-width: 600px) {
            .inner-container { padding: 15px !important; }
            .container { width: 100% !important; }
        }
    </style>
</head>
<body>
    <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #F8F9FA;">
        <tr>
            <td align="center">
                <table class="container" width="600" border="0" cellspacing="0" cellpadding="0" style="background-color: #ffffff; margin: 20px 0; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.05);">
                    <tr>
                        <td class="inner-container">
                            <div class="header">
                                <a href="${getBaseUrl()}" target="_blank">
                                    <img src="${finalLogoUrl}" alt="${siteName} Logo">
                                </a>
                            </div>
                            <div class="content">
                                <h2>${title}</h2>
                                ${bodyContent}
                            </div>
                            <div class="footer">
                                <p>&copy; ${new Date().getFullYear()} ${siteName}. All rights reserved.</p>
                                <p>This is an automated email. Please do not reply directly.</p>
                            </div>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>
`;
};

export function getAccountDisabledEmailHtml(userName: string, siteName: string, logoUrl?: string, contactEmail?: string): string {
  const supportEmail = contactEmail || "support@yourdomain.com";
  const bodyContent = `
    <p>Hi ${userName},</p>
    <p>We are writing to inform you that your account on <strong>${siteName}</strong> has been suspended/disabled by the administrator.</p>
    <p>Consequently, you will not be able to log in or book services. If you believe this is a mistake or would like to request reactivation, please contact our support team at <a href="mailto:${supportEmail}">${supportEmail}</a>.</p>
    <p>Regards,<br>The ${siteName} Team</p>
  `;
  return createHtmlTemplate("Account Disabled", bodyContent, siteName, logoUrl);
}

export function getAccountActivatedEmailHtml(userName: string, siteName: string, logoUrl?: string): string {
  const loginUrl = `${getBaseUrl()}/auth/login`;
  const bodyContent = `
    <p>Hi ${userName},</p>
    <p>We are pleased to inform you that your account on <strong>${siteName}</strong> has been successfully activated/unblocked!</p>
    <p>You can now log in, manage your bookings, and access all services on our platform.</p>
    <p><a href="${loginUrl}" class="button" style="color: #ffffff !important;">Log In to Your Account</a></p>
    <p>Regards,<br>The ${siteName} Team</p>
  `;
  return createHtmlTemplate("Account Activated", bodyContent, siteName, logoUrl);
}
