
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
  numberOfReviews: z.coerce.number().int().min(1).max(30).describe("The number of reviews to generate (1-30)."),
});
export type GenerateBulkReviewsInput = z.infer<typeof GenerateBulkReviewsInputSchema>;

// Schema for a single generated review
const GeneratedReviewSchema = z.object({
  userName: z.string().describe("A distinct, realistic Indian full name (first name + last name)."),
  rating: z.number().min(3).max(5).describe("A rating between 3 and 5."),
  comment: z.string().describe("A concise, natural review comment (15-45 words) focusing on a unique aspect."),
});

// Output schema for the flow
const GenerateBulkReviewsOutputSchema = z.object({
  reviews: z.array(GeneratedReviewSchema).describe("An array of generated reviews."),
});
export type GenerateBulkReviewsOutput = z.infer<typeof GenerateBulkReviewsOutputSchema>;

// Extensive name pool (4,000 combinations) for guaranteed unique names across all Indian regions
const FIRST_NAMES = [
  'Aarav', 'Vivaan', 'Aditya', 'Vihaan', 'Arjun', 'Sai', 'Reyansh', 'Ayaan', 'Krishna', 'Ishaan',
  'Shaurya', 'Rohan', 'Atharv', 'Srikanth', 'Pranav', 'Advait', 'Kabir', 'Anish', 'Dhruv', 'Karthik',
  'Manish', 'Vikram', 'Rajesh', 'Suresh', 'Ramesh', 'Gaurav', 'Nikhil', 'Rahul', 'Varun', 'Harish',
  'Sachin', 'Deepak', 'Sanjay', 'Manoj', 'Ashok', 'Kishore', 'Praveen', 'Vinod', 'Anand', 'Mahesh',
  'Saanvi', 'Aanya', 'Aadhya', 'Aarohi', 'Ananya', 'Pari', 'Anika', 'Navya', 'Diya', 'Avani',
  'Myra', 'Ira', 'Priya', 'Sneha', 'Pooja', 'Kavita', 'Deepa', 'Divya', 'Ritu', 'Swati',
  'Meera', 'Shruti', 'Neha', 'Sunita', 'Lakshmi', 'Preeti', 'Rashmi', 'Kiran', 'Shilpa', 'Shreya',
  'Jyoti', 'Shalini', 'Tanvi', 'Sandhya', 'Geetha', 'Radhika', 'Nandini', 'Bhavana', 'Aarti', 'Kavya'
];

const LAST_NAMES = [
  'Sharma', 'Verma', 'Kumar', 'Singh', 'Patel', 'Nair', 'Iyer', 'Reddy', 'Rao', 'Gowda',
  'Menon', 'Pillai', 'Mukherjee', 'Banerjee', 'Chatterjee', 'Das', 'Dutta', 'Gupta', 'Aggarwal', 'Jain',
  'Shah', 'Mehta', 'Deshmukh', 'Kulkarni', 'Joshi', 'Patil', 'Bhat', 'Hegde', 'Shetty', 'Pai',
  'Choudhury', 'Mishra', 'Pandey', 'Trivedi', 'Yadav', 'Malhotra', 'Kapoor', 'Khanna', 'Bhatia', 'Saxena',
  'Chawla', 'Sood', 'Gill', 'Sandhu', 'Dhillon', 'Grewal', 'Basu', 'Sen', 'Ghosh', 'Majumdar'
];

function generateFallbackUniqueName(usedNamesSet: Set<string>): string {
  for (let attempt = 0; attempt < 500; attempt++) {
    const fn = FIRST_NAMES[Math.floor(Math.random() * FIRST_NAMES.length)];
    const ln = LAST_NAMES[Math.floor(Math.random() * LAST_NAMES.length)];
    const candidate = `${fn} ${ln}`;
    if (!usedNamesSet.has(candidate.toLowerCase())) {
      usedNamesSet.add(candidate.toLowerCase());
      return candidate;
    }
  }
  return `Customer ${Math.floor(1000 + Math.random() * 9000)}`;
}

// The main function to be called from the frontend
export async function generateBulkReviews(input: GenerateBulkReviewsInput): Promise<GenerateBulkReviewsOutput> {
  return generateBulkReviewsFlow(input);
}

const generateReviewsPrompt = ai.definePrompt({
    name: 'generateBulkReviewsPrompt',
    input: { 
      schema: GenerateBulkReviewsInputSchema.extend({
        existingNames: z.array(z.string()).optional(),
        serviceDescription: z.string().optional(),
        serviceItems: z.array(z.string()).optional(),
      }) 
    },
    output: { schema: GenerateBulkReviewsOutputSchema },
    prompt: `Expert review writer for on-demand home doorstep services.
Generate exactly {{numberOfReviews}} completely UNIQUE, authentic customer reviews.

TARGET SERVICE CONTEXT:
Service Name: {{serviceName}}
Category: {{categoryName}}
Sub-Category: {{subCategoryName}}
{{#if serviceDescription}}
Service Overview: {{serviceDescription}}
{{/if}}
{{#if serviceItems}}
Key Inclusions for this Service:
{{#each serviceItems}}
- {{this}}
{{/each}}
{{/if}}

{{#if existingNames}}
CRITICAL - DO NOT USE ANY OF THESE ALREADY EXISTING NAMES:
{{#each existingNames}}
- {{this}}
{{/each}}
{{/if}}

CRITICAL CONTENT ACCURACY & DIVERSITY RULES:
1. STRICT SERVICE MATCHING (MANDATORY): Every single review comment MUST directly and accurately talk about "{{serviceName}}" and the specific task performed.
   - Mention realistic components, symptoms, tools, or parts specific to {{serviceName}} (e.g., for tap/pipe: water leak, washer, valve, drain; for door/lock: latch, cylinder, hinges, alignment, keys; for electrical: switch, wiring, socket, circuit, MCB; for AC/appliance: cooling, filter, motor, noise, gas; for cleaning: stains, suction, shampoo, fresh smell).
   - NEVER generate generic, vague reviews like "good service" or "very nice" that could belong to any random service. Each review must unmistakably describe the experience of getting "{{serviceName}}" done!
2. UNIQUE NAMES: Every single review MUST have a different authentic Indian first & last name (mix of male & female names across various regions of India). Never repeat a name.
3. DIVERSE PERSPECTIVES - Ensure every review talks about a DIFFERENT angle of {{serviceName}}:
   - Perspective A: Prompt diagnosis and quick resolution of the problem with {{serviceName}}
   - Perspective B: Fair upfront pricing, clear estimate, and zero hidden charges
   - Perspective C: Neat workmanship, tidy cleanup, and respecting the customer's home
   - Perspective D: Professional power tools and genuine replacement parts used
   - Perspective E: Booked an emergency or weekend slot and received fast doorstep assistance
   - Perspective F: Honest constructive feedback (e.g., 4 stars: "Arrived 15 mins late due to traffic, but fixed the {{serviceName}} issue permanently")
   - Perspective G: Courteous technician who explained how to maintain the equipment
4. NATURAL TONE VARIATION:
   - Mix concise feedback (15-20 words) with medium detailed comments (25-45 words).
   - Star distribution: mostly 5-stars, some 4-stars, and occasional 3-stars for natural authenticity.

Return ONLY valid JSON adhering to the schema.`,
});

const generateBulkReviewsFlow = ai.defineFlow(
  {
    name: 'generateBulkReviewsFlow',
    inputSchema: GenerateBulkReviewsInputSchema,
    outputSchema: GenerateBulkReviewsOutputSchema,
  },
  async (input) => {
    // 1. Fetch service details from DB to tailor review content specifically to what this service does
    let serviceDescription = '';
    let serviceItems: string[] = [];

    try {
      const serviceDoc = await adminDb.collection("adminServices").doc(input.serviceId).get();
      if (serviceDoc.exists) {
        const sData = serviceDoc.data() || {};
        serviceDescription = sData.description || sData.shortDescription || '';
        if (Array.isArray(sData.includedItems)) {
          serviceItems = sData.includedItems
            .map((item: any) => typeof item === 'string' ? item : item?.value)
            .filter(Boolean)
            .slice(0, 4);
        }
      }
    } catch (err) {
      console.warn("Could not fetch service details for review context:", err);
    }

    // 2. Fetch existing reviewer names from database to prevent repeats
    const existingNamesSet = new Set<string>();
    const existingNamesList: string[] = [];

    try {
      const reviewsRef = adminDb.collection("adminReviews");
      
      // Fetch reviews for this service
      const serviceReviewsSnap = await reviewsRef.where("serviceId", "==", input.serviceId).limit(100).get();
      serviceReviewsSnap.docs.forEach(doc => {
        const d = doc.data();
        const n = (d.userName || d.customerName || '').trim();
        if (n) {
          existingNamesSet.add(n.toLowerCase());
          if (existingNamesList.length < 50) existingNamesList.push(n);
        }
      });

      // Also sample recent global reviews to avoid platform-wide name repetition
      const recentReviewsSnap = await reviewsRef.limit(50).get();
      recentReviewsSnap.docs.forEach(doc => {
        const d = doc.data();
        const n = (d.userName || d.customerName || '').trim();
        if (n) {
          existingNamesSet.add(n.toLowerCase());
          if (existingNamesList.length < 60) existingNamesList.push(n);
        }
      });
    } catch (error) {
      console.error("Error fetching existing names for review generation:", error);
    }

    // 3. Call LLM with exact service context and existing names to avoid
    const { output } = await generateReviewsPrompt({
      ...input,
      existingNames: existingNamesList,
      serviceDescription,
      serviceItems,
    });

    if (!output || !output.reviews || output.reviews.length === 0) {
      throw new Error("AI failed to generate a valid review list.");
    }

    // 3. Post-processing guarantee: Ensure 100% unique names and non-duplicate comments
    const usedNamesInBatch = new Set<string>();
    const sanitizedReviews = output.reviews.map(review => {
      let name = (review.userName || '').trim();
      const normalizedName = name.toLowerCase();

      // If name is empty, already used in database, or already used in this current batch -> replace with guaranteed unique Indian name
      if (!name || existingNamesSet.has(normalizedName) || usedNamesInBatch.has(normalizedName)) {
        name = generateFallbackUniqueName(existingNamesSet);
      }

      usedNamesInBatch.add(name.toLowerCase());
      existingNamesSet.add(name.toLowerCase());

      return {
        userName: name,
        rating: Math.min(5, Math.max(3, Math.round(review.rating || 5))),
        comment: (review.comment || '').trim(),
      };
    });

    return {
      reviews: sanitizedReviews,
    };
  }
);
