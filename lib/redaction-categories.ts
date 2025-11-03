// Redaction categories for smart PII detection

export interface RedactionCategory {
  id: string;
  label: string;
  description: string;
  subcategories?: RedactionSubcategory[];
}

export interface RedactionSubcategory {
  id: string;
  label: string;
  description: string;
  critical?: boolean; // If true, auto-redact this category
}

export const REDACTION_CATEGORIES: RedactionCategory[] = [
  {
    id: 'personal-identifiers',
    label: 'Personal Identifiers',
    description: 'Names and personal identifiers',
    subcategories: [
      {
        id: 'full-names',
        label: 'Full Names',
        description: 'Complete names (first and last)',
        critical: true, // Auto-redact
      },
      {
        id: 'first-names',
        label: 'First Names',
        description: 'First names only',
        critical: true, // Auto-redact
      },
      {
        id: 'last-names',
        label: 'Last Names',
        description: 'Last names only',
        critical: true, // Auto-redact
      },
    ],
  },
  {
    id: 'contact-information',
    label: 'Contact Information',
    description: 'Phone numbers, emails, and addresses',
    subcategories: [
      {
        id: 'phone-numbers',
        label: 'Phone Numbers',
        description: 'All phone number formats',
        critical: true, // Auto-redact
      },
      {
        id: 'email-addresses',
        label: 'Email Addresses',
        description: 'Email addresses',
      },
      {
        id: 'physical-addresses',
        label: 'Physical Addresses',
        description: 'Complete street addresses',
        critical: true, // Auto-redact
      },
    ],
  },
  {
    id: 'location-information',
    label: 'Location Information',
    description: 'Specific places and locations',
    subcategories: [
      {
        id: 'street-names',
        label: 'Street Names',
        description: 'Street names and numbers',
      },
      {
        id: 'city-names',
        label: 'City Names',
        description: 'City names',
      },
      {
        id: 'state-names',
        label: 'State Names',
        description: 'State names',
      },
      {
        id: 'zip-codes',
        label: 'Zip Codes',
        description: 'Postal codes',
      },
      {
        id: 'landmarks',
        label: 'Landmarks',
        description: 'Notable landmarks and locations',
      },
    ],
  },
  {
    id: 'vehicle-information',
    label: 'Vehicle Information',
    description: 'Vehicle-related information',
    subcategories: [
      {
        id: 'license-plates',
        label: 'License Plate Numbers',
        description: 'Vehicle license plates',
        critical: true, // Auto-redact
      },
      {
        id: 'vehicle-make-model',
        label: 'Make and Model',
        description: 'Vehicle make and model',
      },
      {
        id: 'vin-numbers',
        label: 'VIN Numbers',
        description: 'Vehicle identification numbers',
      },
      {
        id: 'vehicle-colors',
        label: 'Vehicle Colors',
        description: 'Vehicle color descriptions',
      },
    ],
  },
  {
    id: 'government-ids',
    label: 'Government IDs',
    description: 'Government-issued identification numbers',
    subcategories: [
      {
        id: 'ssn',
        label: 'Social Security Numbers',
        description: 'SSN in any format',
        critical: true, // Auto-redact
      },
      {
        id: 'drivers-license',
        label: 'Driver\'s License Numbers',
        description: 'Driver\'s license numbers',
        critical: true, // Auto-redact
      },
      {
        id: 'passport-numbers',
        label: 'Passport Numbers',
        description: 'Passport identification numbers',
      },
    ],
  },
  {
    id: 'financial-information',
    label: 'Financial Information',
    description: 'Financial and payment information',
    subcategories: [
      {
        id: 'credit-cards',
        label: 'Credit Card Numbers',
        description: 'Credit card numbers',
      },
      {
        id: 'bank-accounts',
        label: 'Bank Account Numbers',
        description: 'Bank account numbers',
      },
    ],
  },
  {
    id: 'dates-times',
    label: 'Dates & Times',
    description: 'Temporal information',
    subcategories: [
      {
        id: 'birth-dates',
        label: 'Birth Dates',
        description: 'Dates of birth',
        critical: true, // Auto-redact
      },
      {
        id: 'specific-dates',
        label: 'Specific Dates',
        description: 'Exact dates mentioned',
      },
      {
        id: 'exact-times',
        label: 'Exact Times',
        description: 'Specific times mentioned',
      },
    ],
  },
  {
    id: 'organizations',
    label: 'Organizations',
    description: 'Companies and organizations',
    subcategories: [
      {
        id: 'company-names',
        label: 'Company Names',
        description: 'Business and company names',
      },
      {
        id: 'organization-names',
        label: 'Organization Names',
        description: 'Non-profit and organization names',
      },
    ],
  },
];

// Helper to get all subcategory IDs
export function getAllSubcategoryIds(): string[] {
  const subcategoryIds: string[] = [];

  for (const category of REDACTION_CATEGORIES) {
    if (category.subcategories) {
      subcategoryIds.push(...category.subcategories.map(s => s.id));
    }
  }

  return subcategoryIds;
}

// Helper to get critical subcategory IDs (auto-redact)
export function getCriticalSubcategoryIds(): string[] {
  const criticalIds: string[] = [];

  for (const category of REDACTION_CATEGORIES) {
    if (category.subcategories) {
      criticalIds.push(
        ...category.subcategories
          .filter(s => s.critical)
          .map(s => s.id)
      );
    }
  }

  return criticalIds;
}

// Helper to check if a subcategory is critical
export function isCriticalCategory(subcategoryId: string): boolean {
  for (const category of REDACTION_CATEGORIES) {
    const subcategory = category.subcategories?.find(s => s.id === subcategoryId);
    if (subcategory) {
      return subcategory.critical || false;
    }
  }
  return false;
}

// Helper to create OpenAI prompt based on selected categories
export function createRedactionPrompt(selectedSubcategories: string[]): string {
  const categoryLabels = selectedSubcategories.map(id => {
    for (const category of REDACTION_CATEGORIES) {
      const subcategory = category.subcategories?.find(s => s.id === id);
      if (subcategory) {
        return subcategory.label.toLowerCase();
      }
    }
    return null;
  }).filter(Boolean);

  return `You are a PII detection assistant for public safety agencies. Identify all instances of the following types of information in the transcript: ${categoryLabels.join(', ')}.

For each identified piece of information, return the exact text as it appears in the transcript, along with its category.

Return your response as a JSON array with this structure:
[
  {
    "text": "exact text from transcript",
    "category": "category-id",
    "start_word_index": number,
    "end_word_index": number
  }
]

Be precise and only identify information that clearly falls into the requested categories. Match the exact text as it appears in the transcript.`;
}
