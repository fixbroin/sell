
'use server';
/**
 * @fileOverview An AI flow to generate a batch of realistic reviews for a service.
 */

import { ai } from '@/ai/genkit';
import { z } from 'genkit';
import { adminDb } from '@/lib/firebaseAdmin';

// Input schema for generating reviews
const GenerateBulkReviewsInputSchema = z.object({
  serviceId: z.string().describe("The ID of the service to generate reviews for."),
  serviceName: z.string().describe("The name of the service to generate reviews for."),
  categoryName: z.string().describe("The category the service belongs to, for context."),
  subCategoryName: z.string().describe("The sub-category the service belongs to."),
  numberOfReviews: z.coerce.number().int().min(1).max(20).describe("The number of reviews to generate (1-20)."),
});
export type GenerateBulkReviewsInput = z.infer<typeof GenerateBulkReviewsInputSchema>;

// Schema for a single generated review
const GeneratedReviewSchema = z.object({
  userName: z.string().describe("A realistic, common Indian name (e.g.,Srikanth Sachin Priya Sharma, Rohan Kumar)."),
  rating: z.number().min(3).max(5).describe("A rating between 4 and 5."),
  comment: z.string().describe("A realistic, concise review comment (10-80 words). Comments should be a mix of very positive, moderately positive, and neutral tones. They should sound natural and authentic."),
});

// Output schema for the flow
const GenerateBulkReviewsOutputSchema = z.object({
  reviews: z.array(GeneratedReviewSchema).describe("An array of generated reviews."),
});
export type GenerateBulkReviewsOutput = z.infer<typeof GenerateBulkReviewsOutputSchema>;


// The main function to be called from the frontend
export async function generateBulkReviews(input: GenerateBulkReviewsInput): Promise<GenerateBulkReviewsOutput> {
  return generateBulkReviewsFlow(input);
}


const generateReviewsPrompt = ai.definePrompt({
    name: 'generateBulkReviewsPrompt',
    input: { 
      schema: GenerateBulkReviewsInputSchema.extend({
        existingNames: z.array(z.string()).optional()
      }) 
    },
    output: { schema: GenerateBulkReviewsOutputSchema },
    prompt: `You are an expert content generator for a home services website called "Yourbrand".
Your task is to generate a batch of realistic customer reviews for a specific service.
The reviews should sound authentic, use common Indian names, and have a mix of positive tones.

Service Name: {{serviceName}}
Category: {{categoryName}}
Sub-Category: {{subCategoryName}}

{{#if existingNames}}
The following names are already used for existing reviews of this service. DO NOT use any of these names:
{{#each existingNames}}
- {{this}}
{{/each}}
{{/if}}

Please generate exactly {{numberOfReviews}} unique reviews with NEW, DIFFERENT common Indian names.

For each review, provide:
1.  **userName**: A plausible, common Indian name (mix of male and female names). Ensure it is NOT in the excluded list above.
2.  **rating**: An integer rating between 4 and 5. The distribution should be mostly 4s and 5s, with a few 3s.
3.  **comment**: A short, natural-sounding review comment between 10 and 80 words. The tone should vary (e.g., "Good work.", "Very professional and quick service!", "Satisfied with the job, but was a bit late.").

Return the entire response as a single, valid JSON object that adheres to the defined output schema.
`,
});

const generateBulkReviewsFlow = ai.defineFlow(
  {
    name: 'generateBulkReviewsFlow',
    inputSchema: GenerateBulkReviewsInputSchema,
    outputSchema: GenerateBulkReviewsOutputSchema,
  },
  async (input) => {
    // Fetch existing reviewer names from the database to avoid duplicates
    let existingNames: string[] = [];
    try {
      const reviewsRef = adminDb.collection("adminReviews");
      const q = reviewsRef.where("serviceId", "==", input.serviceId).limit(100);
      const querySnapshot = await q.get();
      existingNames = querySnapshot.docs.map(doc => doc.data().userName as string);
    } catch (error) {
      console.error("Error fetching existing names for review generation:", error);
      // Proceed with empty list on error to not block generation
    }

    const { output } = await generateReviewsPrompt({
      ...input,
      existingNames
    });

    if (!output || !output.reviews) {
      throw new Error("AI failed to generate a valid review list.");
    }
    return output;
  }
);
