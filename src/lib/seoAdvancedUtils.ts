/**
 * @fileOverview Advanced SEO utilities for cleaning and optimizing SEO metadata.
 */

/**
 * Maps category names to high-intent search terms (singular/person forms).
 * This helps target keywords like "Carpenter in Whitefield" instead of "Carpentry in Whitefield".
 */
export function getCategorySearchTerm(categoryName: string): string {
  const name = categoryName.trim();
  const lowerName = name.toLowerCase();

  const mapping: Record<string, string> = {
    'carpentry': 'Carpenter',
    'plumbing': 'Plumber',
    'electrical': 'Electrician',
    'painting': 'Painter',
    'cleaning': 'Cleaning Services',
    'appliance repair': 'Appliance Repair',
    'pest control': 'Pest Control',
    'ac service': 'AC Technician',
    'ac services': 'AC Technician',
    'home cleaning': 'Home Cleaners',
    'bathroom cleaning': 'Bathroom Cleaners',
    'sofa cleaning': 'Sofa Cleaners',
    'kitchen cleaning': 'Kitchen Cleaners',
    'waterproofing': 'Waterproofing Experts',
  };

  if (mapping[lowerName]) return mapping[lowerName];

  // Simple plural to singular or "y" to "er" rules for common cases
  if (lowerName.endsWith('ing')) {
    // Plumbing -> Plumber (handled in mapping, but as a backup)
  }
  
  return name;
}

/**
 * Removes redundant words and cleans up SEO strings.
 * It removes duplicate words within a sentence but is now more 
 * careful not to break SEO-critical repetition.
 */
export function cleanSeoString(text: string | undefined | null): string {
  if (!text) return '';

  // 1. Basic cleaning: remove extra spaces
  let cleaned = text.replace(/\s+/g, ' ').trim();

  // 2. Remove common over-repeated patterns (e.g., "Professional Professional")
  // Only remove if it's EXACTLY the same word repeated consecutively.
  // We allow "Carpenter in Whitefield | Carpenter near me" because they are not adjacent.
  cleaned = cleaned.replace(/\b(\w+)\s+\1\b/gi, '$1');

  // 3. Specific cleanup for Yourbrand
  // If "Yourbrand" is at the end of multiple segments, it's fine. 
  // e.g., "Carpenter in Whitefield | Yourbrand"

  return cleaned;
}

/**
 * Ensures a string doesn't exceed a certain length while keeping it natural.
 */
export function truncateSeoString(text: string, maxLength: number): string {
  if (!text) return '';
  if (text.length <= maxLength) return text;
  
  // Try to cut at the last full word
  const truncated = text.slice(0, maxLength);
  const lastSpace = truncated.lastIndexOf(' ');
  
  if (lastSpace > maxLength * 0.7) { // Increased tolerance to 70%
    return truncated.slice(0, lastSpace).trim();
  }
  
  return truncated.trim();
}

/**
 * Advanced placeholder replacement with cleaning.
 */
export function replaceAndCleanPlaceholders(
  template: string | undefined | null,
  data: Record<string, string | number | undefined | null>
): string {
  if (!template) return '';
  
  let result = template;
  try {
    for (const key in data) {
      if (Object.prototype.hasOwnProperty.call(data, key)) {
        const placeholderValue = data[key];
        const value = placeholderValue !== undefined && placeholderValue !== null ? String(placeholderValue) : '';
        result = result.replace(new RegExp(`{{${key}}}`, 'g'), value);
      }
    }
  } catch (e) {
    return template;
  }
  
  // After replacement, clean the string
  return cleanSeoString(result);
}

/**
 * Generates a list of LSI (Latent Semantic Indexing) keywords for home services.
 */
export function getLSIKeywords(category: string, city: string = 'Bangalore'): string[] {
  const common = ['best', 'professional', 'top-rated', 'trusted', 'expert', 'near me', 'affordable', 'reliable'];
  const localized = [`in ${city}`, `${city} experts`, `booking ${city}`];
  
  return [
    `${category} ${city}`,
    `best ${category} ${city}`,
    `professional ${category} services`,
    `${category} near me`,
    ...common.map(c => `${c} ${category}`),
  ];
}

/**
 * Generates BreadcrumbList JSON-LD schema.
 */
export function generateBreadcrumbSchema(items: { name: string; url?: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    "itemListElement": items.map((item, index) => ({
      "@type": "ListItem",
      "position": index + 1,
      "name": item.name,
      ...(item.url ? { "item": item.url } : {})
    }))
  };
}
