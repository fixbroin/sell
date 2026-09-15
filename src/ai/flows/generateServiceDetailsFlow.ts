
'use server';
/**
 * @fileOverview An AI flow to generate comprehensive details for a home service.
 *
 * - generateServiceDetails - A function that takes a service name and context, and returns generated content.
 * - GenerateServiceDetailsInput - The input type for the flow.
 * - GenerateServiceDetailsOutput - The return type for the flow.
 */

import { ai } from '@/ai/genkit';
import { z } from 'genkit';
import { cleanSeoString, truncateSeoString } from '@/lib/seoAdvancedUtils';

const GenerateServiceDetailsInputSchema = z.object({
  serviceName: z.string().describe("The name of the home service, e.g., 'AC Deep Cleaning' or 'Leaky Faucet Repair'."),
  categoryName: z.string().describe("The main category the service belongs to, e.g., 'Appliance Repair' or 'Plumbing'."),
  subCategoryName: z.string().describe("The specific sub-category, e.g., 'AC Repair' or 'Bathroom Fittings'."),
});
export type GenerateServiceDetailsInput = z.infer<typeof GenerateServiceDetailsInputSchema>;

const GenerateServiceDetailsOutputSchema = z.object({
  shortDescription: z.string().describe("A concise, one-sentence description for the service card. Max 200 characters."),
  fullDescription: z.string().describe("A slightly longer, one-paragraph marketing description for the service detail page. Highlight key benefits like speed, quality, and professionalism. MUST BE UNDER 300 characters."),
  pleaseNote: z.array(z.string()).describe("An array of 2-4 important notes or disclaimers for the customer."),
  imageHint: z.string().describe("One or two keywords for an AI image search for the service's main image. E.g., 'plumber fixing' or 'clean kitchen'. Max 50 characters."),
  serviceHighlights: z.array(z.string()).describe("An array of 3-5 short, punchy strings highlighting key features or benefits of the service."),
  includedItems: z.array(z.string()).describe("An array of 3-5 strings listing what is included in the service package."),
  excludedItems: z.array(z.string()).describe("An array of 2-4 strings listing what is NOT included in the service package."),
  taskTime: z.object({
    value: z.number().describe("The estimated time value to complete the task."),
    unit: z.enum(['minutes', 'hours']).describe("The unit of time for the value."),
  }).describe("An estimated time for how long the service task takes."),
  serviceFaqs: z.array(
    z.object({
      question: z.string().describe("A frequently asked question about the service. Frame it to capture voice search intent (e.g., 'How much does it cost to...')."),
      answer: z.string().describe("A clear, helpful, and localized answer to the question."),
    })
  ).describe("An array of 3-4 frequently asked questions. These are crucial for 'People Also Ask' rich snippets on Google."),
  seo: z.object({
    h1_title: z.string().describe("An H1 title for the service page."),
    seo_title: z.string().describe("An SEO-optimized meta title, under 60 characters."),
    seo_description: z.string().describe("An SEO-optimized meta description, under 160 characters."),
    seo_keywords: z.string().describe("A comma-separated string of 10 relevant SEO keywords."),
  }).describe("SEO related content for the service page."),
  rating: z.coerce.number().min(4.5).max(5).describe("A random rating between 4.5 and 5.0, with one decimal place (e.g., 4.8, 4.9) to boost click-through rates."),
  reviewCount: z.coerce.number().int().min(150).max(1500).describe("A random integer review count between 150 and 1500."),
});
export type GenerateServiceDetailsOutput = z.infer<typeof GenerateServiceDetailsOutputSchema>;

export async function generateServiceDetails(input: GenerateServiceDetailsInput): Promise<GenerateServiceDetailsOutput> {
  return generateServiceDetailsFlow(input);
}

const prompt = ai.definePrompt({
  name: 'generateServiceDetailsPrompt',
  input: { schema: GenerateServiceDetailsInputSchema },
  output: { schema: GenerateServiceDetailsOutputSchema },
  prompt: `You are an expert Local SEO copywriter for "Yourbrand", Bangalore's leading home services company.
Your goal is to generate high-conversion content and SEO metadata for a specific service.

Service Name: {{serviceName}}
Category: {{categoryName}}
Sub-Category: {{subCategoryName}}

**STRATEGIC SEO GUIDELINES:**
1. **Avoid Repetitive Phrasing**: Do not use "{{serviceName}}" excessively. If the service name is "AC Repair", avoid "Professional AC Repair Services for AC Repair". Use "Expert AC Maintenance" or "Trusted Cooling Solutions".
2. **Local Authority**: Naturally integrate "Bangalore" and neighborhoods like Indiranagar, HSR Layout, or Electronic City.
3. **Rich Snippets**: FAQs should be phrased for voice search (e.g., "How long does AC service take in Bangalore?").
4. **Aggressive SEO**: Use high-intent modifiers: "Best", "Top-Rated", "Verified Pros", "Upfront Pricing", "Same-Day Service".

**OUTPUT INSTRUCTIONS:**
- **shortDescription**: Concise, mentions Bangalore.
- **fullDescription**: Marketing-heavy, highlights reliability and Bangalore coverage. Under 300 chars.
- **serviceFaqs**: 3-4 Q&As localized for Bangalore.
- **seo.h1_title**: Dynamic and strong. E.g., "Expert {{serviceName}} Services in Bangalore".
- **seo.seo_title**: Catchy, under 60 chars. E.g., "{{serviceName}} in Bangalore | Best Prices & Verified Pros".
- **seo.seo_description**: Compelling summary under 160 chars.

Return the entire response as a single, valid JSON object.
`,
});

const generateServiceDetailsFlow = ai.defineFlow(
  {
    name: 'generateServiceDetailsFlow',
    inputSchema: GenerateServiceDetailsInputSchema,
    outputSchema: GenerateServiceDetailsOutputSchema,
  },
  async (input) => {
    const { output } = await prompt(input);
    if (!output) {
      throw new Error("AI failed to generate a valid response.");
    }

    // Clean SEO strings to ensure no redundant words
    return {
      ...output,
      seo: {
        h1_title: cleanSeoString(output.seo.h1_title),
        seo_title: truncateSeoString(cleanSeoString(output.seo.seo_title), 60),
        seo_description: truncateSeoString(cleanSeoString(output.seo.seo_description), 160),
        seo_keywords: output.seo.seo_keywords,
      },
      shortDescription: truncateSeoString(cleanSeoString(output.shortDescription), 200),
      fullDescription: truncateSeoString(cleanSeoString(output.fullDescription), 300),
    };
  }
);
