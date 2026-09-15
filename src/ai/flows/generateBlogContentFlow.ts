'use server';
/**
 * @fileOverview An AI flow to generate comprehensive blog content and SEO metadata for home services in HTML format.
 */

import { ai } from '@/ai/genkit';
import { z } from 'genkit';
import { cleanSeoString, truncateSeoString, stripBrandSuffix } from '@/lib/seoAdvancedUtils';

const GenerateBlogContentInputSchema = z.object({
  title: z.string().describe("The title of the blog post to generate content for."),
  categoryName: z.string().optional().describe("The optional category name for more specific SEO generation (e.g., Carpentry, Plumber, Electrician)."),
  currentYear: z.string().optional().describe("The current year for dynamic content generation."),
});
export type GenerateBlogContentInput = z.infer<typeof GenerateBlogContentInputSchema>;

const GenerateBlogContentOutputSchema = z.object({
  content: z.string().describe(
  "Complete SEO blog in HTML format. Minimum 1000-1500 words. Use h2, p, ul, li and br tags. Follow blog structure with large spacing between sections, homeowner-focused content, service benefits, common problems, service coverage, tips, pricing guidance, advantages, CTA, and related keywords."),
  excerpt: z.string().describe("A short, catchy summary of the blog post (max 150 characters) to be used on the blog list card."),
  tags: z.string().describe(
  "Comma-separated string of 5-8 highly relevant SEO tags."),
  readingTime: z.string().describe("Estimated reading time, e.g., '5 min' or '8 min'."),
  h1_title: z.string().describe("An H1 title for the blog page."),
  meta_title: z.string().describe("Meta title strictly 35-48 characters. NEVER include company name (template appends it)."),
  meta_description: z.string().describe("Meta description under 155 characters."),
  meta_keywords: z.string().describe("A comma-separated string of SEO keywords."),
  imageHint: z.string()
  .max(50)
  .describe(
    "AI image hint. Maximum 50 characters only."),
});
export type GenerateBlogContentOutput = z.infer<typeof GenerateBlogContentOutputSchema>;

export async function generateBlogContent(input: Omit<GenerateBlogContentInput, 'currentYear'>): Promise<GenerateBlogContentOutput> {
  const currentYear = new Date().getFullYear().toString();
  return generateBlogContentFlow({ ...input, currentYear });
}

const prompt = ai.definePrompt({
  name: 'generateHomeServicesBlogPrompt',
  input: { schema: GenerateBlogContentInputSchema },
  output: { schema: GenerateBlogContentOutputSchema },
  prompt: `

You are Yourbrand's senior SEO content writer and local home services expert.

Generate professional blog content based on:

Title: {{title}}
Category: {{categoryName}}
Year: {{currentYear}}

IMPORTANT:

- Write like a real home service expert.
- Never sound AI generated.
- Never keyword stuff.
- Write naturally.
- Focus on helping homeowners.
- Use local Bangalore relevance naturally.
- Mention areas such as Whitefield, Electronic City, HSR Layout, Sarjapur Road, Koramangala, Bellandur, Brookefield and Marathahalli where appropriate.

HTML FORMAT:

Use ONLY HTML.

Section headings:

<h2><strong>Heading</strong></h2>

Paragraphs:

<p>Text...</p>

Add spacing between sections:

<br><br>

Benefits:

<p><strong>✔ Benefit:</strong> Description.</p>

Lists:

<ul>
<li>✔ Item</li>
</ul>

BLOG STRUCTURE:

1. Introduction

Explain:
- What the service is
- Why it is important
- Common homeowner situations

2. Why This Service Matters

Provide 5 benefit points.

3. Common Services Covered

Short intro and service list.

4. Benefits of Hiring Professionals

Provide 5 practical advantages.

5. Common Problems Homeowners Face

Real situations and solutions.

6. Areas We Serve

Mention relevant Bangalore locations.

7. Tips Before Booking

Helpful homeowner advice.

8. Estimated Pricing Information

General pricing guidance only.

9. Why Choose Yourbrand

Include:
- Skilled professionals
- Transparent pricing
- Quality workmanship
- Quick service
- Local expertise

10. Book Service Today

Strong call to action.

11. Related Services and Keywords

Single paragraph.

SEO RULES:

- Minimum 1200 words.
- Target 1200-1800 words.
- Natural SEO only.
- Use semantic keywords.
- Avoid repeating title excessively.
- Write for humans first.
- Use practical information.

OUTPUT FIELDS:

content
excerpt
tags
readingTime
h1_title
meta_title
meta_description
meta_keywords
imageHint

REQUIREMENTS:

excerpt:
Maximum 150 characters.

tags:
5-8 relevant tags.

readingTime:
Estimate based on content length.

h1_title:
SEO optimized and natural.

meta_title:
Strictly 35 to 48 characters. NEVER include company/brand name (template appends it).

meta_description:
Under 155 characters. Engaging summary with clear call to action.

imageHint:
Maximum 50 characters.
Must describe a realistic service-related image.

Return valid JSON matching the schema.

`,
});

const generateBlogContentFlow = ai.defineFlow(
  {
    name: 'generateHomeServicesBlogFlow',
    inputSchema: GenerateBlogContentInputSchema,
    outputSchema: GenerateBlogContentOutputSchema,
  },
  async (input) => {
    const { output } = await prompt(input);
    if (!output) {
      throw new Error("AI failed to generate a valid blog post response.");
    }

    const cleanTitle = stripBrandSuffix(cleanSeoString(output.meta_title));

    return {
      ...output,
      h1_title: cleanSeoString(output.h1_title),
      meta_title: truncateSeoString(cleanTitle, 48),
      meta_description: truncateSeoString(cleanSeoString(output.meta_description), 155),
      excerpt: truncateSeoString(cleanSeoString(output.excerpt), 150),
    };
  }
);