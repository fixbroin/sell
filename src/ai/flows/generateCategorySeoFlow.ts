'use server';
/**
 * @fileOverview An AI flow to generate SEO content for a service category.
 */

import { ai } from '@/ai/genkit';
import { z } from 'genkit';
import { cleanSeoString, truncateSeoString } from '@/lib/seoAdvancedUtils';

const GenerateCategorySeoInputSchema = z.object({
  categoryName: z.string().describe("The name of the service category, e.g., 'Carpentry' or 'Appliance Repair'."),
});
export type GenerateCategorySeoInput = z.infer<typeof GenerateCategorySeoInputSchema>;

const GenerateCategorySeoOutputSchema = z.object({
  h1_title: z.string().describe("An H1 title optimized for the category page."),
  seo_title: z.string().describe("An SEO-optimized meta title, under 60 characters."),
  seo_description: z.string().describe("An SEO-optimized meta description, under 160 characters."),
  seo_keywords: z.string().describe("A comma-separated string of 10 highly relevant local SEO keywords."),
  seo_content: z.string().describe("A 200-300 word long-form SEO bio for the category, including benefits and Bangalore relevance."),
  faqs: z.array(z.object({
    question: z.string(),
    answer: z.string()
  })).describe("3-5 high-intent FAQs about the service category in Bangalore."),
  imageHint: z.string().describe("One or two keywords for an AI image search."),
});
export type GenerateCategorySeoOutput = z.infer<typeof GenerateCategorySeoOutputSchema>;

export async function generateCategorySeo(input: GenerateCategorySeoInput): Promise<GenerateCategorySeoOutput> {
  return generateCategorySeoFlow(input);
}

const prompt = ai.definePrompt({
  name: 'generateCategorySeoPrompt',
  input: { schema: GenerateCategorySeoInputSchema },
  output: { schema: GenerateCategorySeoOutputSchema },
  prompt: `You are an expert Local SEO copywriter for "Yourbrand", the leading home services platform in Bangalore, India.
Your goal is to generate advanced, high-intent SEO content for a service category page to dominate Bangalore search results.

Category Name: {{categoryName}}

**CRITICAL SEO RULES:**
1. **Exact Match Priority**: Do NOT start with "Best", "Top-Rated", or "Professional". Your primary keyword MUST be "{{categoryName}} in Bangalore". If {{categoryName}} is a "service" noun (like Carpentry), transform it into the "person" noun (like Carpenter).
2. **Keyword First**: The H1 and Meta Title MUST start with "{{categoryName}} in Bangalore".
3. **Intent Keywords**: Include "near me" later in the title, like "{{categoryName}} in Bangalore | {{categoryName}} Near Me".
4. **Keyword Placement**: Place the primary keyword (e.g., "Carpenter in Bangalore") at the start.

**OUTPUT FIELDS:**
1.  **h1_title**: MUST be exactly "{{categoryName}} in Bangalore".
2.  **seo_title**: Exactly "{{categoryName}} in Bangalore | {{categoryName}} Near Me | Yourbrand".
3.  **seo_description**: A click-worthy description under 160 chars including the primary keyword and benefits like "Same-Day Service".
4.  **seo_keywords**: 10 high-volume, localized keywords like "{{categoryName}} near me", "best {{categoryName}} bangalore", etc.
5.  **seo_content**: A 200-300 word professional, keyword-rich bio. Describe the range of {{categoryName}} services offered in Bangalore, the expertise of Yourbrand pros, and why customers choose Yourbrand. Use HTML tags like <p>, <strong>, and <br> for formatting.
6.  **faqs**: Generate 3-5 Frequently Asked Questions that people in Bangalore ask about {{categoryName}} services.
7.  **imageHint**: Keywords for finding a relevant high-quality image.

Return the entire response as a single, valid JSON object.
`,
});

const generateCategorySeoFlow = ai.defineFlow(
  {
    name: 'generateCategorySeoFlow',
    inputSchema: GenerateCategorySeoInputSchema,
    outputSchema: GenerateCategorySeoOutputSchema,
  },
  async (input) => {
    const { output } = await prompt(input);
    if (!output) {
      throw new Error("AI failed to generate a valid SEO response for the category.");
    }
    
    // Clean and strictly truncate
    return {
      h1_title: cleanSeoString(output.h1_title),
      seo_title: truncateSeoString(cleanSeoString(output.seo_title), 60),
      seo_description: truncateSeoString(cleanSeoString(output.seo_description), 160),
      seo_keywords: output.seo_keywords,
      seo_content: output.seo_content,
      faqs: output.faqs,
      imageHint: output.imageHint,
    };
  }
);
