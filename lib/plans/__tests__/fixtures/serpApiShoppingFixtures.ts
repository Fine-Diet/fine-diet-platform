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
