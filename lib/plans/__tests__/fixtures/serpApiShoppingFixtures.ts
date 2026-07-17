export const SERPAPI_SPINACH_FIXTURE = {
  shopping_results: [
    {
      position: 1,
      title: 'Organic Girl Baby Spinach 5 oz',
      source: 'Whole Foods Market',
      extracted_price: 3.99,
      product_link: 'https://example.com/spinach',
      thumbnail: 'https://example.com/spinach.jpg',
      extensions: ['In store'],
    },
    {
      position: 2,
      title: 'Sponsored Variety Pack Greens',
      source: 'Other Market',
      price: '$8.99',
      link: 'https://example.com/sponsored',
    },
  ],
};

export const SERPAPI_EMPTY_FIXTURE = {
  shopping_results: [],
};

export const SERPAPI_UPC_FIXTURE = {
  shopping_results: [
    {
      position: 1,
      title: 'Chobani Greek Yogurt 32 oz',
      source: 'Target',
      extracted_price: 5.49,
      barcode: '036632085412',
      product_link: 'https://example.com/yogurt',
    },
  ],
};

/** Title lacks size; package size only appears in extensions. */
export const SERPAPI_EXTENSION_PACKAGE_FIXTURE = {
  shopping_results: [
    {
      position: 1,
      title: 'Organic Girl Baby Spinach',
      source: 'Whole Foods Market',
      extracted_price: 3.99,
      extensions: ['5 oz', 'In store'],
      product_link: 'https://example.com/spinach-extension',
    },
  ],
};

/** Structured product_attributes carry net weight when title/extensions omit it. */
export const SERPAPI_STRUCTURED_PACKAGE_FIXTURE = {
  shopping_results: [
    {
      position: 1,
      title: 'Organic Valley Whole Milk',
      source: 'Target',
      extracted_price: 4.29,
      product_attributes: [
        { name: 'Brand', value: 'Organic Valley' },
        { name: 'Net weight', value: '64 fl oz' },
      ],
      product_link: 'https://example.com/milk-structured',
    },
  ],
};

/** Conflicting package hints should not produce a parsed package. */
export const SERPAPI_AMBIGUOUS_PACKAGE_FIXTURE = {
  shopping_results: [
    {
      position: 1,
      title: 'Snack Mix Variety 5 oz',
      source: 'Target',
      extracted_price: 6.99,
      extensions: ['12 oz'],
      product_link: 'https://example.com/ambiguous',
    },
  ],
};

/** No package hints anywhere in returned fields. */
export const SERPAPI_MISSING_PACKAGE_FIXTURE = {
  shopping_results: [
    {
      position: 1,
      title: 'Fresh Herbs Bundle',
      tagline: 'Locally sourced',
      snippet: 'Tastes good (120 user reviews)',
      source: 'Whole Foods Market',
      extracted_price: 2.99,
      extensions: ['In store', 'Nearby, 2 mi'],
      product_link: 'https://example.com/herbs',
    },
  ],
};

/** Tagline carries package size when title omits it. */
export const SERPAPI_TAGLINE_PACKAGE_FIXTURE = {
  shopping_results: [
    {
      position: 1,
      title: 'Kerrygold Pure Irish Butter',
      tagline: '8 oz salted',
      source: 'Whole Foods Market',
      extracted_price: 5.99,
      product_link: 'https://example.com/butter-tagline',
    },
  ],
};

/** Nutrition claim appears before the true retail net contents. */
export const SERPAPI_NUTRITION_CLAIM_PACKAGE_FIXTURE = {
  shopping_results: [
    {
      position: 1,
      title: 'Chobani 20g Protein Lowfat Greek Yogurt Cherry Berry 6.7oz',
      source: 'Target',
      extracted_price: 1.79,
      product_link: 'https://example.com/chobani-cherry-berry',
    },
  ],
};

/** Same product/retailer/URL, but distinct trusted package variants. */
export const SERPAPI_ALMOND_BUTTER_VARIANTS_FIXTURE = {
  shopping_results: [
    {
      position: 1,
      title: 'Whole Foods Almond Butter',
      source: 'Whole Foods Market',
      extracted_price: 8.99,
      extensions: ['16 oz jar'],
      product_link: 'https://example.com/almond-butter',
    },
    {
      position: 2,
      title: 'Whole Foods Almond Butter',
      source: 'Whole Foods Market',
      extracted_price: 13.99,
      extensions: ['28 oz jar'],
      product_link: 'https://example.com/almond-butter',
    },
  ],
};

/** Nutrition serving metadata is not retail net-content evidence. */
export const SERPAPI_SERVING_SIZE_ONLY_FIXTURE = {
  shopping_results: [
    {
      position: 1,
      title: 'Whole Foods Almond Butter',
      source: 'Whole Foods Market',
      extracted_price: 8.99,
      product_details: [{ name: 'Serving size', value: '32 g' }],
      snippet: 'Serving size: 32 g',
      product_link: 'https://example.com/almond-butter-serving',
    },
  ],
};

/** Percentages, dimensions, and model numbers must not become package sizes. */
export const SERPAPI_NUMERIC_NOISE_FIXTURE = {
  shopping_results: [
    {
      position: 1,
      title: 'Organic Valley 2% Lowfat Milk 64 fl oz',
      source: 'Target',
      extracted_price: 4.29,
      product_link: 'https://example.com/milk-percent',
    },
    {
      position: 2,
      title: 'Almond Butter Dimensions: 20G x 30G',
      source: 'Whole Foods Market',
      extracted_price: 8.99,
      product_link: 'https://example.com/almond-butter-dimensions',
    },
    {
      position: 3,
      title: 'Almond Butter Model 20G',
      source: 'Whole Foods Market',
      extracted_price: 8.99,
      product_link: 'https://example.com/almond-butter-model',
    },
  ],
};
