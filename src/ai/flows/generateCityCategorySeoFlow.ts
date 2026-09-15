'use server';
/**
 * @fileOverview AI flow to generate highly optimized
 * SEO content for service category city pages.
 */

import { ai } from '@/ai/genkit';
import { z } from 'genkit';

import {
  cleanSeoString,
  truncateSeoString,
} from '@/lib/seoAdvancedUtils';

const GenerateCityCategorySeoInputSchema =
  z.object({
    cityName: z.string().describe(
      'City name. Example: Bangalore'
    ),

    categoryName: z.string().describe(
      'Service category name. Example: Carpentry'
    ),
  });

export type GenerateCityCategorySeoInput =
  z.infer<
    typeof GenerateCityCategorySeoInputSchema
  >;

const GenerateCityCategorySeoOutputSchema =
  z.object({
    h1_title: z.string().describe(
      'SEO optimized H1 title'
    ),

    meta_title: z.string().describe(
      'SEO optimized meta title'
    ),

    meta_description: z.string().describe(
      'SEO optimized meta description'
    ),

    meta_keywords: z.string().describe(
      'Comma separated SEO keywords'
    ),

    seo_content: z.string().describe(
      'Long form SEO HTML content'
    ),

    faqs: z
      .array(
        z.object({
          question: z.string(),

          answer: z.string(),
        })
      )
      .describe(
        'Local SEO FAQs'
      ),
    imageHint: z.string().describe(
      'One or two keywords for an AI image search'
    ),
  });

export type GenerateCityCategorySeoOutput =
  z.infer<
    typeof GenerateCityCategorySeoOutputSchema
  >;

export async function generateCityCategorySeo(
  input: GenerateCityCategorySeoInput
): Promise<GenerateCityCategorySeoOutput> {
  return generateCityCategorySeoFlow(input);
}

const prompt = ai.definePrompt({
  name: 'generateCityCategorySeoPrompt',

  input: {
    schema:
      GenerateCityCategorySeoInputSchema,
  },

  output: {
    schema:
      GenerateCityCategorySeoOutputSchema,
  },

  prompt: `
You are an advanced Local SEO expert for Yourbrand.

Yourbrand provides:
- Carpenter services
- Plumbing services
- Electrician services
- TV installation services
- Painting services
- Furniture assembly services
- Interior services
- Home repair services

TARGET:
City: {{cityName}}
Category: {{categoryName}}

IMPORTANT SEO RULES:

1. Strongly optimize for:
- carpenter near me
- plumber near me
- electrician near me
- tv installation near me
- painting services near me
- furniture assembly near me

2. Avoid overusing:
- handyman
- best
- top-rated
- professional

3. Use natural human-friendly SEO.

4. Category + city should appear naturally.

5. Improve Google CTR.

6. Avoid keyword stuffing.

7. Generate ONLY valid JSON.

8. No markdown.

9. Use India local SEO intent.

10. SEO content should rank for local searches.

11. imageHint: One or two keywords for an AI image search.

OUTPUT RULES:

1. h1_title
Format:
"{{categoryName}} Services in {{cityName}}"

Examples:
"Carpenter Services in Bangalore"
"Electrician Services in Bangalore"

2. meta_title
Rules:
- Under 60 characters
- Natural
- Search optimized

Examples:
"Carpenter Near Me in Bangalore"
"Electrician Services in Bangalore"

3. meta_description
Rules:
- Under 160 characters
- Mention:
  - city name
  - trusted experts
  - category service
  - near you intent

Example:
"Book trusted carpenter services in Bangalore with Yourbrand experts near you for repair, installation, and furniture work."

4. meta_keywords
Rules:
- Exactly 10 keywords
- Comma separated
- High search intent only

Example:
carpenter bangalore,
carpenter near me bangalore,
furniture repair bangalore,
wood work bangalore,
bed assembly bangalore,
wardrobe installation bangalore,
carpenter services bangalore,
door repair bangalore,
furniture assembly bangalore,
wooden work bangalore

5. seo_content
Rules:
- 200 to 300 words
- HTML format only
- Use:
  - <p>
  - <strong>
  - <br>

- Mention:
  - major Bangalore areas
  - service quality
  - verified experts
  - same day service
  - affordable pricing
  - customer trust

- Content must feel human written.

- Avoid robotic repetition.

6. faqs
Rules:
- Generate 5 FAQs
- Highly local SEO focused
- Mention Bangalore areas naturally
- Questions should match real Google searches

Examples:
"Do you provide carpenter services in Whitefield?"
"Can I book electrician services near me in HSR Layout?"

7. imageHint: Keywords for finding a relevant high-quality image.

Generate highly optimized city category SEO now.
`,
});

const generateCityCategorySeoFlow =
  ai.defineFlow(
    {
      name:
        'generateCityCategorySeoFlow',

      inputSchema:
        GenerateCityCategorySeoInputSchema,

      outputSchema:
        GenerateCityCategorySeoOutputSchema,
    },

    async (input) => {
      const { output } =
        await prompt(input);

      if (!output) {
        throw new Error(
          'AI failed to generate valid city category SEO.'
        );
      }

      return {
        h1_title: cleanSeoString(
          output.h1_title
        ),

        meta_title: truncateSeoString(
          cleanSeoString(
            output.meta_title
          ),
          60
        ),

        meta_description:
          truncateSeoString(
            cleanSeoString(
              output.meta_description
            ),
            160
          ),

        meta_keywords:
          cleanSeoString(
            output.meta_keywords
          ),

        seo_content:
          output.seo_content,

        faqs: output.faqs,
        imageHint: output.imageHint,
      };
    }
  );