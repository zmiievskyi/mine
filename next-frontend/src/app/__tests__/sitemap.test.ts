jest.mock('@/i18n/routing', () => ({
  routing: {
    locales: ['en', 'ru', 'zh'],
    defaultLocale: 'en',
    localePrefix: 'always',
  },
}));

import sitemap from '../sitemap';

describe('sitemap', () => {
  it('generates URLs for all locales and pages', () => {
    const entries = sitemap();
    // 3 locales (en, ru, zh) × 2 pages (landing, request-gpu) = 6
    expect(entries).toHaveLength(6);
  });

  it('uses correct base URL', () => {
    const entries = sitemap();
    for (const entry of entries) {
      expect(entry.url).toMatch(/^https:\/\/minegnk\.com\//);
    }
  });

  it('includes all locale variants for landing page', () => {
    const entries = sitemap();
    const landingUrls = entries.filter((e) => !e.url.includes('request-gpu'));
    expect(landingUrls.map((e) => e.url)).toEqual(
      expect.arrayContaining([
        'https://minegnk.com/en',
        'https://minegnk.com/ru',
        'https://minegnk.com/zh',
      ])
    );
  });

  it('includes all locale variants for request-gpu page', () => {
    const entries = sitemap();
    const gpuUrls = entries.filter((e) => e.url.includes('request-gpu'));
    expect(gpuUrls.map((e) => e.url)).toEqual(
      expect.arrayContaining([
        'https://minegnk.com/en/request-gpu',
        'https://minegnk.com/ru/request-gpu',
        'https://minegnk.com/zh/request-gpu',
      ])
    );
  });

  it('sets correct priority and changeFrequency', () => {
    const entries = sitemap();
    const landing = entries.find((e) => e.url === 'https://minegnk.com/en');
    const gpuPage = entries.find((e) => e.url === 'https://minegnk.com/en/request-gpu');

    expect(landing?.priority).toBe(1);
    expect(landing?.changeFrequency).toBe('weekly');
    expect(gpuPage?.priority).toBe(0.8);
    expect(gpuPage?.changeFrequency).toBe('monthly');
  });
});
