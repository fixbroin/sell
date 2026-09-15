
'use server';

/**
 * @fileOverview AI flow to generate comprehensive, realistic and
 * service-specific details for Yourbrand services.
 *
 * The AI dynamically understands the service name, category and
 * sub-category instead of blindly applying one generic template.
 */

import { ai } from '@/ai/genkit';
import { z } from 'genkit';
import {
  cleanSeoString,
  truncateSeoString,
  stripBrandSuffix,
} from '@/lib/seoAdvancedUtils';

const GenerateServiceDetailsInputSchema = z.object({
  serviceName: z
    .string()
    .describe(
      "Exact service name entered by the admin, e.g. 'TV Installation – 56 to 65 Inches', 'Carpenter Full Day Service 7 Hours', 'Water Purifier Installation', or 'Business Website'."
    ),

  categoryName: z
    .string()
    .describe(
      "Parent category, e.g. Carpentry, Appliance Installation, Plumbing, Electrical, Cleaning, Web Services."
    ),

  subCategoryName: z
    .string()
    .describe(
      "Specific sub-category, e.g. Television, Washing Machine, Water Purifier, Carpenter, Website Design."
    ),

  cityName: z
    .string()
    .optional()
    .describe(
      "Target city for local SEO. Defaults to Bangalore when not provided."
    ),
});

export type GenerateServiceDetailsInput =
  z.infer<typeof GenerateServiceDetailsInputSchema>;

const GenerateServiceDetailsOutputSchema = z.object({
  shortDescription: z
    .string()
    .describe(
      'Short service-card description. Maximum 200 characters. Natural, specific and customer-friendly.'
    ),

  fullDescription: z
    .string()
    .describe(
      'Detailed introductory service description. Maximum 300 characters. Explain what the technician does and what the service is suitable for.'
    ),

  pleaseNote: z
    .array(z.string())
    .min(5)
    .max(8)
    .describe(
      '5 to 8 realistic, service-specific notes, limitations and booking conditions.'
    ),

  imageHint: z
    .string()
    .max(50)
    .describe(
      'Realistic 3 to 6 word description of the service being performed. Maximum 50 characters.'
    ),

  serviceHighlights: z
    .array(z.string())
    .min(5)
    .max(6)
    .describe(
      '5 to 6 concise service benefits or useful characteristics. Do not simply duplicate Included Items.'
    ),

  includedItems: z
    .array(z.string())
    .min(5)
    .max(7)
    .describe(
      '5 to 7 actual tasks, steps or components included in the service.'
    ),

  excludedItems: z
    .array(z.string())
    .min(6)
    .max(8)
    .describe(
      '6 to 8 realistic scope exclusions specific to this service.'
    ),

  taskTime: z.object({
    value: z
      .number()
      .min(1)
      .describe(
        'Realistic estimated working time value. If the service specifies a duration, use that duration.'
      ),

    unit: z
      .enum(['minutes', 'hours'])
      .describe('Time unit for the estimated task duration.'),
  }),

  serviceFaqs: z
    .array(
      z.object({
        question: z
          .string()
          .min(5)
          .max(250)
          .describe('A realistic question a customer may ask before booking.'),

        answer: z
          .string()
          .min(10)
          .max(2000)
          .describe(
            'Direct, practical answer in 1 to 2 sentences. Never mention warranty or guarantees.'
          ),
      })
    )
    .min(5)
    .max(6)
    .describe('5 to 6 high-intent practical customer FAQs.'),

  seo: z.object({
    h1_title: z
      .string()
      .describe(
        "An H1 title with the exact format '{{serviceName}} Service Near You'."
      ),

    seo_title: z
      .string()
      .describe(
        "An SEO-optimized meta title, under 60 characters, with the format '{{serviceName}} Near Me | {{categoryName}} Near Me'."
      ),

    seo_description: z
      .string()
      .describe(
        "An SEO-optimized meta description, under 160 characters. Should be a compelling summary that encourages clicks."
      ),

    seo_keywords: z
      .string()
      .describe(
        "A comma-separated string of 10 relevant SEO keywords. Must include variations like '{{serviceName}} near me', '{{serviceName}} near you', '{{categoryName}} near me', '{{categoryName}} near you'."
      ),
  }),

  rating: z
    .coerce
    .number()
    .min(4.7)
    .max(5)
    .describe(
      'Realistic default rating between 4.7 and 5.0. Admin can manually change this later.'
    ),

  reviewCount: z
    .coerce
    .number()
    .int()
    .min(120)
    .max(950)
    .describe(
      'Realistic review count between 120 and 950. Admin can manually change this later.'
    ),
});

export type GenerateServiceDetailsOutput =
  z.infer<typeof GenerateServiceDetailsOutputSchema>;

export async function generateServiceDetails(
  input: GenerateServiceDetailsInput
): Promise<GenerateServiceDetailsOutput> {
  return generateServiceDetailsFlow(input);
}

const prompt = ai.definePrompt({
  name: 'generateServiceDetailsPrompt',

  input: {
    schema: GenerateServiceDetailsInputSchema,
  },

  output: {
    schema: GenerateServiceDetailsOutputSchema,
  },

  prompt: `
You are the **Yourbrand Service Content Engine**.

You are an expert in:
- Home-service operations
- Appliance installation and uninstallation
- Carpentry
- Plumbing
- Electrical work
- Cleaning
- Pest control
- Painting
- AC services
- Website and digital services
- Local SEO
- Customer-focused service descriptions

Your task is to generate complete service-page content for Yourbrand.

============================================================
INPUT
============================================================

Service Name:
{{serviceName}}

Parent Category:
{{categoryName}}

Sub-Category:
{{subCategoryName}}

Target City:
{{#if cityName}}{{cityName}}{{else}}Bangalore{{/if}}

============================================================
MOST IMPORTANT RULE
============================================================

UNDERSTAND THE EXACT SERVICE BEFORE WRITING.

The SERVICE NAME is the primary source of truth.

Do NOT blindly use one template for every service.

First mentally determine:

1. What exactly is the customer booking?
2. What item, appliance, property, task or digital product is involved?
3. What professional normally performs the work?
4. What work is normally included?
5. What practical steps are normally performed?
6. What tools or equipment are reasonably required?
7. What materials, hardware, spare parts or third-party services may cost extra?
8. What work is outside the normal scope?
9. What physical/site limitations may apply?
10. What questions would a real customer ask before booking?

Then write the content.

Every service should feel individually written.

============================================================
WRITING STYLE
============================================================

Use simple, professional Indian English.

Write like an experienced Yourbrand service operations manager explaining the service to a real customer.

The writing should be:

- Clear
- Natural
- Practical
- Professional
- Specific
- Easy to understand
- Customer-focused
- Trustworthy
- Suitable for a service marketplace

Do not use excessive marketing language.

Do not make every service start with:

"Get your..."
"Book a professional..."
"Experience..."
"Enjoy..."
"Say goodbye to..."

Vary the opening naturally.

Do not make every service sound copied from another service.

Avoid unnecessary words.

Avoid keyword stuffing.

Avoid repetitive sentences between sections.

============================================================
FACTUAL ACCURACY
============================================================

Never invent unreasonable information.

Do not invent:

- Brand partnerships
- Certifications
- Technician qualifications
- Free materials
- Free accessories
- Free transportation
- Premium tools
- Unspecified features
- Unspecified services
- Customer testimonials
- Fake claims of being the "best"
- Warranty
- Guarantee
- Money-back guarantee

IMPORTANT:

The rating and reviewCount fields ARE intentionally generated because Yourbrand's admin can manually change them later.

Generate realistic values between the schema limits.

Do not mention that the rating or review count was generated by AI.

============================================================
SERVICE DURATION
============================================================

Determine realistic task time from the actual service.

If the service name explicitly contains a duration, ALWAYS respect it.

Examples:

"Carpenter Full Day Service 7 Hours"
→ 7 hours

"Book Carpenter Hourly"
→ choose a realistic hourly booking duration, such as 1 hour

"TV Installation – Up to 32 Inches"
→ realistic installation time

"TV Installation – 56 to 65 Inches"
→ allow additional handling time because of larger TV size

"Washing Machine Installation"
→ realistic installation duration

"Washing Machine Uninstallation"
→ realistic uninstallation duration

Do not randomly select durations.

============================================================
SHORT DESCRIPTION
============================================================

Generate a concise service-card description.

Maximum 200 characters.

It must explain:
- What the customer is booking
- Main work involved
- Important specification if relevant

Make it natural.

Do not repeat the service name unnecessarily.

============================================================
FULL DESCRIPTION
============================================================

Generate a concise introductory description.

Maximum 300 characters.

Explain:
- What the service does
- What the technician/professional will do
- Main purpose
- Relevant type, size or specification

Do not simply copy the Short Description.

============================================================
PLEASE NOTE
============================================================

Generate 5 to 8 realistic notes.

These must be specific to THIS service.

Use applicable rules such as:

- Labour charges only
- Material charges additional
- Spare parts additional
- Customer-provided accessories
- One unit / one location
- Site accessibility
- Ladder requirement
- Water requirement
- Electricity requirement
- Plumbing limitations
- Electrical limitations
- Civil work limitations
- Transportation limitations
- Heavy shifting limitations
- Additional work charges
- Special access requirements

Do not add irrelevant disclaimers.

For example:

TV installation:
- Compatible bracket
- Wall condition
- Electrical modifications
- Concealed wiring
- Ladder
- Wall repair

Carpenter hourly:
- Minimum booking
- Materials extra
- One location
- No helper
- No cleaning
- No heavy shifting
- Additional hours subject to availability

Water purifier installation:
- Water inlet
- Drain connection
- Power point
- Additional fittings
- Plumbing modifications
- Wall condition

============================================================
WHAT'S INCLUDED
============================================================

Generate 5 to 7 actual things included.

These should be real work steps or service components.

Good examples:

- Wall mounting
- Alignment and leveling
- Water inlet connection
- Basic functionality check
- Door hinge adjustment
- Furniture assembly
- Basic drilling

Avoid vague items such as:

- Professional service
- Best quality
- Expert workmanship
- Customer satisfaction

============================================================
WHAT'S NOT INCLUDED
============================================================

Generate 6 to 8 realistic exclusions.

Only include exclusions relevant to the service.

Possible examples:

- Materials
- Spare parts
- Transportation
- Heavy shifting
- New electrical socket
- Concealed wiring
- Wall repair
- Painting
- Major civil work
- Ladder
- Scaffolding
- Helper
- Cleaning
- Multiple locations

Do not blindly add all of these to every service.

============================================================
SERVICE HIGHLIGHTS
============================================================

Generate 5 to 6 short useful highlights.

Highlights should focus on customer benefits and suitability.

Examples:

- Suitable for most standard TV sizes
- Professional wall mounting
- Basic alignment and leveling
- Convenient doorstep service
- Suitable for multiple minor carpentry tasks
- Basic operational check after installation

Do not simply duplicate Included Items.

============================================================
FAQ
============================================================

Generate 5 to 6 realistic customer questions.

Think like a real customer before booking.

Useful FAQ topics include:

- What is included?
- What sizes/types are supported?
- Are materials included?
- Is the bracket/accessory included?
- How long does it take?
- Can additional work be done?
- Is transportation included?
- What should the customer arrange?
- Can the service be done at another location?
- What happens if additional work is required?

Answers must be:

- Direct
- Practical
- 1 to 2 sentences
- Easy to understand

Never mention warranty or guarantees.

============================================================
IMAGE HINT
============================================================

Generate a realistic 4 to 8 word image prompt.

Show the actual work being performed.

Examples:

"technician mounting 55 inch TV on wall"

"carpenter repairing wooden wardrobe door"

"technician installing RO purifier in kitchen"

"technician installing washing machine at home"

Avoid abstract business graphics.

============================================================
CATEGORY INTELLIGENCE
============================================================

Use Category and Sub-Category as supporting context.

Do NOT apply every category rule to every service.

-------------------------
CARPENTRY
-------------------------

Relevant work may include:

- Furniture assembly
- Furniture repair
- Beds
- Hydraulic beds
- Wardrobes
- Cabinets
- Shelves
- Study tables
- Doors
- Hinges
- Locks
- Drawer channels
- Handles
- Measurements
- Drilling
- Alignment
- Hardware installation

Common boundaries:

- Materials extra
- Replacement hardware extra
- Heavy shifting excluded
- Cleaning excluded
- Polishing/varnishing excluded unless specified
- Civil/masonry work excluded
- Tall ladders/scaffolding excluded unless arranged

-------------------------
PLUMBING
-------------------------

Relevant work may include:

- Taps
- Mixers
- Showers
- Wash basins
- Toilets
- Flush systems
- Water connections
- Drain connections
- Leaks
- Valves
- Pipe connections

Relevant checks:

- Water flow
- Leakage
- Pressure
- Connection sealing

Common boundaries:

- Spare parts extra
- Major pipe replacement extra
- Tile breaking excluded
- Civil work excluded
- Wall repair excluded

-------------------------
ELECTRICAL
-------------------------

Relevant work may include:

- Switches
- Sockets
- Fans
- Lights
- MCBs
- Inverter connections
- Appliance power connections
- Basic electrical testing

Relevant checks:

- Power isolation
- Voltage testing
- Terminal tightening
- Basic functionality

Common boundaries:

- New concealed wiring
- Major rewiring
- Wall grooving
- Civil repair
- Materials/spares

-------------------------
APPLIANCE INSTALLATION
-------------------------

Relevant work may include:

- Positioning
- Mounting
- Connection
- Leveling
- Basic testing
- Manufacturer-supplied accessories

Examples:

TV
Washing machine
Water purifier
Microwave
Chimney
Refrigerator
Geyser

Common boundaries:

- Transportation
- Major plumbing
- Major electrical work
- Spare parts
- Structural modifications

-------------------------
APPLIANCE UNINSTALLATION
-------------------------

Relevant work:

- Safe disconnection
- Water disconnection
- Drain disconnection
- Power disconnection
- Mount/bracket removal
- Appliance removal from installed position

Common boundaries:

- Transportation
- Shifting
- Reinstallation
- Wall repair
- Plumbing modifications
- Electrical modifications

-------------------------
AC SERVICES
-------------------------

Relevant work may include:

- AC cleaning
- Installation
- Uninstallation
- Drain checking
- Cooling check
- Indoor/outdoor unit work
- Refrigerant-related work when explicitly requested

Common boundaries:

- Refrigerant/gas
- Copper pipe
- Spare parts
- High-rise access equipment
- Scaffolding

-------------------------
CLEANING
-------------------------

Consider:

- Surface type
- Cleaning method
- Required access
- Water
- Electricity
- Furniture/appliance access

Common boundaries:

- Heavy furniture shifting
- Severe restoration
- Special treatment unless explicitly included

-------------------------
PEST CONTROL
-------------------------

Consider:

- Target pest
- Treatment method
- Application area
- Preparation requirements
- Ventilation instructions

Do not make unsupported medical claims.

-------------------------
PAINTING / WATERPROOFING
-------------------------

Consider:

- Surface preparation
- Crack filling
- Primer
- Paint/coating
- Drying
- Number of coats when specified

Common boundaries:

- Heavy furniture shifting
- Major civil reconstruction
- High-rise scaffolding unless included

-------------------------
WEB / DIGITAL SERVICES
-------------------------

Consider:

- Website design
- Development
- Responsive design
- Pages
- Contact forms
- CMS
- SEO
- Integrations
- Domain
- Hosting
- Third-party services

Common boundaries:

- Domain charges
- Hosting charges
- Paid APIs
- Premium plugins
- Premium themes/assets
- Advanced custom software unless specified

============================================================
SPECIAL SERVICE TYPES
============================================================

If the service is an HOURLY service:

Focus on:
- Booked duration
- One professional
- Work performed during booked time
- Materials extra
- Additional time
- One location
- Scope restrictions

If the service is a HALF-DAY or FULL-DAY service:

Focus on:
- Exact working duration
- Number of professionals
- Working schedule if specified
- Multiple tasks
- Tools
- Materials
- Helper restrictions
- One location

If the service is an INSTALLATION:

Focus on:
- Positioning
- Installation
- Connections
- Alignment
- Testing
- Accessories
- Site requirements

If the service is an UNINSTALLATION:

Focus on:
- Safe disconnection
- Removal
- Careful handling
- Preparation for shifting
- No transportation unless explicitly included

If the service is a REPAIR:

Focus on:
- Inspection
- Diagnosis
- Repair
- Adjustment
- Testing
- Parts/materials if required

If the service is a WEBSITE/DIGITAL service:

Focus on:
- Deliverables
- Pages/features
- Responsive design
- Integrations
- Basic SEO
- Domain/hosting boundaries
- Third-party costs

============================================================
SEO
============================================================

Generate high-intent, SEO-optimized metadata following this exact structure:

1. **h1_title**:
   Format: "{{serviceName}} Service Near You"
   (If the service name already includes "Service", do not duplicate it. For example, use "Carpenter Daily Service Near You", NOT "Carpenter Daily Service Service Near You").

2. **seo_title**:
   Format: "{{serviceName}} Near Me | {{categoryName}} Near Me"
   MUST be under 60 characters.
   Use the natural trade name for the category when applicable (e.g., use "Carpenter Near Me" for Carpentry, "Plumber Near Me" for Plumbing, "Electrician Near Me" for Electrical).
   Do NOT include Yourbrand in the meta title because the website adds the brand name automatically.

3. **seo_description**:
   SEO meta description under 160 characters.
   A compelling, click-worthy summary that encourages bookings.
   Pattern: "Book professional {{serviceName}} near me by skilled {{category/trade}}. [Scope/Benefit]. [Key condition/Labour only]."
   Example: "Book professional digital or electronic lock installation near me by skilled carpenters. Secure fitting on wooden doors for enhanced safety. Labour only, lock provided by customer."

4. **seo_keywords**:
   A comma-separated string of 10 relevant SEO keywords.
   MUST include variations like:
   - '{{serviceName}} near me'
   - '{{serviceName}} near you'
   - '{{categoryName}} near me'
   - '{{categoryName}} near you'
   - natural local search terms and common customer phrasing for this service.
   Example: "digital lock installation near me, electronic lock fitting near me, carpenter near me, carpenter near you, smart lock installation near me, wooden door lock installation near me"

============================================================
QUALITY CONTROL BEFORE OUTPUT
============================================================

Before returning the JSON, mentally check every field.

CHECK 1:
Does the content match the exact service?

CHECK 2:
Does the service-specific information make sense?

CHECK 3:
Are Included and Excluded items logically consistent?

CHECK 4:
Are the notes realistic?

CHECK 5:
Are FAQs useful to actual customers?

CHECK 6:
Is the task duration realistic?

CHECK 7:
Are there no unsupported claims?

CHECK 8:
Is there no warranty or guarantee?

CHECK 9:
Are there no irrelevant category rules?

CHECK 10:
Does the content feel individually written rather than copied?

CHECK 11:
Short description <= 200 characters.

CHECK 12:
Full description <= 300 characters.

CHECK 13:
SEO title <= 48 characters.

CHECK 14:
SEO description < 155 characters.

CHECK 15:
SEO keywords contain realistic search phrases.

CHECK 16:
Rating is between 4.7 and 5.0.

CHECK 17:
Review count is between 120 and 950.

============================================================
FINAL OUTPUT
============================================================

Return ONLY valid JSON matching the supplied schema.

Do not return Markdown.

Do not return explanations outside JSON.
`,
});

const generateServiceDetailsFlow = ai.defineFlow(
  {
    name: 'generateServiceDetailsFlow',
    inputSchema: GenerateServiceDetailsInputSchema,
    outputSchema: GenerateServiceDetailsOutputSchema,
  },

  async (input) => {
    const cityName = input.cityName || 'Bangalore';

    const { output } = await prompt({
      ...input,
      cityName,
    });

    if (!output) {
      throw new Error('AI failed to generate a valid response.');
    }

    /*
     * Keep the existing rating/review behaviour.
     * These values are intentionally generated because the admin
     * can manually change them after generation.
     */
    const rating = Math.min(
      5,
      Math.max(4.7, Number(output.rating) || 4.8)
    );

    const reviewCount = Math.min(
      950,
      Math.max(120, Math.round(Number(output.reviewCount) || 250))
    );

    const cleanTitle = stripBrandSuffix(
      cleanSeoString(output.seo.seo_title)
    );

    return {
      ...output,

      rating,
      reviewCount,

      seo: {
        h1_title: cleanSeoString(output.seo.h1_title),

        seo_title: truncateSeoString(
          cleanTitle,
          60
        ),

        seo_description: truncateSeoString(
          cleanSeoString(output.seo.seo_description),
          160
        ),

        seo_keywords: cleanSeoString(
          output.seo.seo_keywords
        ),
      },

      shortDescription: truncateSeoString(
        cleanSeoString(output.shortDescription),
        200
      ),

      fullDescription: truncateSeoString(
        cleanSeoString(output.fullDescription),
        300
      ),

      imageHint: truncateSeoString(
        cleanSeoString(output.imageHint),
        50
      ),

      pleaseNote: (output.pleaseNote || []).map(
        (item) => cleanSeoString(item)
      ),

      serviceHighlights: (
        output.serviceHighlights || []
      ).map((item) => cleanSeoString(item)),

      includedItems: (
        output.includedItems || []
      ).map((item) => cleanSeoString(item)),

      excludedItems: (
        output.excludedItems || []
      ).map((item) => cleanSeoString(item)),

      serviceFaqs: (
        output.serviceFaqs || []
      ).map((faq) => ({
        question: cleanSeoString(faq.question),
        answer: cleanSeoString(faq.answer),
      })),
    };
  }
);
