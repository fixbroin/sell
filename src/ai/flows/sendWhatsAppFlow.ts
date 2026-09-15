
'use server';
/**
 * @fileOverview A Genkit flow to send a WhatsApp template message.
 */

import { ai } from '@/ai/genkit';
import { z } from 'genkit';
import axios from 'axios';
import { getBaseUrl } from '@/lib/config'; // Import getBaseUrl

const WhatsAppInputSchema = z.object({
  to: z.string().describe("The recipient's phone number with country code (e.g., 919876543210)."),
  templateName: z.string().describe("The name of the approved WhatsApp template."),
  parameters: z.array(z.string()).describe("An array of strings for the template's placeholders."),
});

export type WhatsAppInput = z.infer<typeof WhatsAppInputSchema>;

export async function sendWhatsAppFlow(input: WhatsAppInput): Promise<{ success: boolean; message: string }> {
    const { templateName, parameters } = input;
    let { to } = input;
    
    const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
    const WHATSAPP_PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID;

    if (!WHATSAPP_TOKEN || !WHATSAPP_PHONE_NUMBER_ID) {
      const errorMsg = "WhatsApp API credentials are not configured on the server.";
      console.error(`sendWhatsAppFlow: ${errorMsg}`);
      return { success: false, message: errorMsg };
    }

    // Sanitize phone number
    if (!to.startsWith('+')) {
        to = to.replace(/\D/g, ''); // Remove non-digits
        if (to.length === 10 && !to.startsWith('91')) { // Basic check for Indian numbers
            to = `91${to}`;
        }
    } else {
        to = to.replace(/\D/g, '');
    }

    // Base components structure for templates with an image header and a static URL button
    const components: any[] = [
        {
            type: 'header',
            parameters: [{
                type: 'image',
                image: { link: `${getBaseUrl()}/default-image.png` }
            }]
        },
        // The button component for a static URL button does not require a parameters field.
        // It is defined in the template on Meta's platform.
        // REMOVED `sub_type: 'url'` as it was causing issues.
        {
            type: 'button',
            index: '0',
            // No 'parameters' field should be here for static URLs.
        }
    ];

    // Conditionally add the BODY component only if parameters are provided.
    // This is inserted at index 1, between header and button.
    if (parameters && parameters.length > 0) {
        components.splice(1, 0, {
            type: 'body',
            parameters: parameters.map(p => ({ type: 'text', text: p || ' ' })) // Use space if param is empty
        });
    }

    try {
      const response = await axios.post(
        `https://graph.facebook.com/v19.0/${WHATSAPP_PHONE_NUMBER_ID}/messages`,
        {
          messaging_product: 'whatsapp',
          to: to,
          type: 'template',
          template: {
            name: templateName,
            language: { code: 'en_US' },
            components: components,
          },
        },
        {
          headers: {
            'Authorization': `Bearer ${WHATSAPP_TOKEN}`,
            'Content-Type': 'application/json',
          },
        }
      );

      if (response.status === 200) {
        console.log(`WhatsApp message sent to ${to} using template ${templateName}. Response:`, response.data);
        return { success: true, message: `Message sent to ${to}.` };
      } else {
        console.error(`WhatsApp API returned status ${response.status} for ${to}. Response:`, response.data);
        return { success: false, message: `WhatsApp API returned status ${response.status}.` };
      }
    } catch (error: any) {
        const errorMsg = error.response?.data?.error?.message || error.message || "An unknown error occurred.";
        console.error(`sendWhatsAppFlow: Error sending template ${templateName} to ${to}:`, error.response?.data || error);
        return { success: false, message: errorMsg };
    }
}
ai.defineFlow(
  {
    name: 'sendWhatsAppMessage',
    inputSchema: WhatsAppInputSchema,
    outputSchema: z.object({ success: z.boolean(), message: z.string() }),
  },
  sendWhatsAppFlow
);
