import robots from '../robots';

describe('robots', () => {
  it('allows all user agents on root', () => {
    const config = robots();
    expect(config.rules).toEqual(
      expect.objectContaining({
        userAgent: '*',
        allow: '/',
      })
    );
  });

  it('disallows /api/ routes', () => {
    const config = robots();
    expect(config.rules).toEqual(
      expect.objectContaining({
        disallow: ['/api/'],
      })
    );
  });

  it('points to sitemap', () => {
    const config = robots();
    expect(config.sitemap).toBe('https://minegnk.com/sitemap.xml');
  });
});
