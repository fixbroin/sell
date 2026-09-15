'use server';
/**
 * @fileOverview AI flow to generate highly optimized
 * hyper-local SEO content for area category pages.
 */

import { ai } from '@/ai/genkit';
import { z } from 'genkit';

import {
  cleanSeoString,
  truncateSeoString,
} from '@/lib/seoAdvancedUtils';

const GenerateAreaCategorySeoInputSchema =
  z.object({
    areaName: z.string().describe(
      'Area name. Example: Whitefield'
    ),

    cityName: z.string().describe(
      'City name. Example: Bangalore'
    ),

    categoryName: z.string().describe(
      'Category name. Example: Carpentry'
    ),
  });

export type GenerateAreaCategorySeoInput =
  z.infer<
    typeof GenerateAreaCategorySeoInputSchema
  >;

const GenerateAreaCategorySeoOutputSchema =
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
        'Hyper local SEO FAQs'
      ),
    imageHint: z.string().describe(
      'One or two keywords for an AI image search'
    ),
  });

export type GenerateAreaCategorySeoOutput =
  z.infer<
    typeof GenerateAreaCategorySeoOutputSchema
  >;

export async function generateAreaCategorySeo(
  input: GenerateAreaCategorySeoInput
): Promise<GenerateAreaCategorySeoOutput> {
  return generateAreaCategorySeoFlow(
    input
  );
}

const prompt = ai.definePrompt({
  name:
    'generateAreaCategorySeoPrompt',

  input: {
    schema:
      GenerateAreaCategorySeoInputSchema,
  },

  output: {
    schema:
      GenerateAreaCategorySeoOutputSchema,
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
Area: {{areaName}}
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

4. Area + category should appear naturally.

5. Improve Google CTR.

6. Avoid keyword stuffing.

7. Generate ONLY valid JSON.

8. No markdown.

9. Use India local SEO intent.

10. Content should rank for hyper-local searches.

11. Mention important nearby landmarks naturally.

12. Mention local Bangalore areas nearby.

OUTPUT RULES:

1. h1_title
Format:
"{{categoryName}} Services in {{areaName}}"

Examples:
"Carpenter Services in Whitefield"
"Electrician Services in HSR Layout"

2. meta_title
Rules:
- Under 60 characters
- Natural
- Search optimized

Examples:
"Carpenter Near Me in Whitefield"
"Electrician Services in HSR Layout"

3. meta_description
Rules:
- Under 160 characters
- Mention:
  - area name
  - trusted experts
  - category service
  - near you intent

Example:
"Book trusted carpenter services in Whitefield Bangalore with Yourbrand experts near you for repair and installation work."

4. meta_keywords
Rules:
- Exactly 10 keywords
- Comma separated
- High search intent only

Example:
carpenter whitefield,
carpenter near me whitefield,
furniture repair whitefield,
wood work whitefield,
bed assembly whitefield,
wardrobe installation whitefield,
door repair whitefield,
furniture assembly whitefield,
electrician near me whitefield,
plumber near me whitefield

5. seo_content
Rules:
- 250 to 350 words
- HTML format only
- Use:
  - <p>
  - <strong>
  - <br>

- Mention:
  - nearby landmarks
  - local Bangalore areas
  - verified experts
  - same day service
  - affordable pricing
  - customer trust

- Mention area name naturally multiple times.

- Content must feel human written.

- Avoid robotic repetition.

6. faqs
Rules:
- Generate 5 FAQs
- Highly local SEO focused
- Mention area name naturally
- Mention nearby localities
- Questions should match real Google searches

Examples:
"Do you provide carpenter services near Phoenix Marketcity Whitefield?"
"Can I book electrician services in HSR Layout near me?"

7. imageHint: Keywords for finding a relevant high-quality image.

Generate highly optimized hyper-local SEO now.
`,
});

const generateAreaCategorySeoFlow =
  ai.defineFlow(
    {
      name:
        'generateAreaCategorySeoFlow',

      inputSchema:
        GenerateAreaCategorySeoInputSchema,

      outputSchema:
        GenerateAreaCategorySeoOutputSchema,
    },

    async (input) => {
      const { output } =
        await prompt(input);

      if (!output) {
        throw new Error(
          'AI failed to generate valid area category SEO.'
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