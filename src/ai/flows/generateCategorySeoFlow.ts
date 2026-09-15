'use server';
/**
 * @fileOverview An AI flow to generate SEO content for a service category.
 */

import { ai } from '@/ai/genkit';
import { z } from 'genkit';
import { cleanSeoString, truncateSeoString, stripBrandSuffix } from '@/lib/seoAdvancedUtils';

const GenerateCategorySeoInputSchema = z.object({
  categoryName: z.string().describe("The name of the service category, e.g., 'Carpentry' or 'Appliance Repair'."),
  cityName: z.string().optional().describe("Target city name, e.g., 'Bangalore'. Defaults to 'Bangalore' if omitted."),
});
export type GenerateCategorySeoInput = z.infer<typeof GenerateCategorySeoInputSchema>;

const GenerateCategorySeoOutputSchema = z.object({
  h1_title: z.string().describe("An H1 title optimized for the category page."),
  seo_title: z.string().describe("Meta title strictly 35-48 characters. NEVER include company name (template appends it). Use '{{categoryName}} in {{cityName}} | Near Me'."),
  seo_description: z.string().describe("Meta description strictly under 155 characters featuring '{{categoryName}} in {{cityName}} near you', verified pros, upfront pricing, and 'Book online now!'."),
  seo_keywords: z.string().describe("10 comma-separated localized SEO keywords."),
  seo_content: z.string().describe("A 200-280 word professional HTML bio for the category with local relevance."),
  faqs: z.array(z.object({
    question: z.string(),
    answer: z.string()
  })).describe("3-5 high-intent FAQs about the service category."),
  imageHint: z.string().describe("One or two keywords for an image search."),
});
export type GenerateCategorySeoOutput = z.infer<typeof GenerateCategorySeoOutputSchema>;

export async function generateCategorySeo(input: GenerateCategorySeoInput): Promise<GenerateCategorySeoOutput> {
  return generateCategorySeoFlow(input);
}

const prompt = ai.definePrompt({
  name: 'generateCategorySeoPrompt',
  input: { schema: GenerateCategorySeoInputSchema },
  output: { schema: GenerateCategorySeoOutputSchema },
  prompt: `Local SEO Copywriter for Home Services.
Generate high-conversion SEO content for category page.

Category: {{categoryName}}
City: {{#if cityName}}{{cityName}}{{else}}Bangalore{{/if}}

CRITICAL SEO RULES:
1. NEVER include brand/company names (e.g. "Yourbrand", "Fixbro") in seo_title. The website template automatically appends it.
2. seo_title MUST be strictly between 35 and 48 characters. Transform service noun to person noun if natural (e.g. Carpentry -> Carpenter). Format: "{{categoryName}} in {{#if cityName}}{{cityName}}{{else}}Bangalore{{/if}} | Near Me".
3. seo_description MUST be under 155 characters: "Book trusted {{categoryName}} in {{#if cityName}}{{cityName}}{{else}}Bangalore{{/if}} near you. Doorstep service by verified experts, upfront pricing & same-day visit. Book now!".
4. seo_keywords MUST be 10 high-search phrases mixing category + city and "near me".
5. faqs MUST be 3-5 real customer questions regarding pricing, warranty, and same-day service.

Return ONLY valid JSON.`,
});

const generateCategorySeoFlow = ai.defineFlow(
  {
    name: 'generateCategorySeoFlow',
    inputSchema: GenerateCategorySeoInputSchema,
    outputSchema: GenerateCategorySeoOutputSchema,
  },
  async (input) => {
    const cityName = input.cityName || 'Bangalore';
    const { output } = await prompt({ ...input, cityName });
    if (!output) {
      throw new Error("AI failed to generate a valid SEO response for the category.");
    }

    const cleanTitle = stripBrandSuffix(cleanSeoString(output.seo_title));
    
    return {
      h1_title: cleanSeoString(output.h1_title),
      seo_title: truncateSeoString(cleanTitle, 48),
      seo_description: truncateSeoString(cleanSeoString(output.seo_description), 155),
      seo_keywords: cleanSeoString(output.seo_keywords),
      seo_content: output.seo_content,
      faqs: output.faqs,
      imageHint: output.imageHint,
    };
  }
);
