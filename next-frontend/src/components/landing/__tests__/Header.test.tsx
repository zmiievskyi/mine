import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Header } from '../Header';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

jest.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

jest.mock('@/i18n/navigation', () => ({
  Link: ({ children, href, ...props }: any) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

jest.mock('@/components/ui/NetworkStatus', () => ({
  NetworkStatus: () => <div data-testid="network-status" />,
}));

jest.mock('@/components/ui/LanguageSwitcher', () => ({
  LanguageSwitcher: () => <div data-testid="language-switcher" />,
}));

jest.mock('@/components/ui/HardLink', () => ({
  HardLink: ({ children, href, onClick, ...props }: any) => (
    <a href={href} onClick={onClick} {...props}>
      {children}
    </a>
  ),
}));

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Header', () => {
  it('renders the MineGNK logo link', () => {
    render(<Header />);

    const logo = screen.getByRole('link', { name: 'MineGNK' });
    expect(logo).toBeInTheDocument();
    expect(logo).toHaveAttribute('href', '/');
  });

  it('renders all desktop navigation links', () => {
    render(<Header />);

    // t() returns the key, so nav labels are their translation keys
    expect(screen.getByRole('link', { name: 'nav.features' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'nav.pricing' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'nav.efficiency' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'nav.howItWorks' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'nav.faq' })).toBeInTheDocument();
  });

  it('renders the CTA button linking to the request-gpu page', () => {
    render(<Header />);

    // There may be two CTA links (desktop + hidden mobile), so we query all
    const ctaLinks = screen.getAllByRole('link', { name: 'hero.cta' });
    expect(ctaLinks.length).toBeGreaterThanOrEqual(1);
    expect(ctaLinks[0]).toHaveAttribute('href', '/request-gpu');
  });

  it('mobile menu is hidden before the toggle is clicked', () => {
    render(<Header />);

    // The mobile navigation section exists in the DOM only when the menu is open.
    // Verify the toggle button starts with aria-expanded="false".
    const toggleButton = screen.getByRole('button', { name: /toggle menu/i });
    expect(toggleButton).toHaveAttribute('aria-expanded', 'false');
  });

  it('mobile menu becomes visible after clicking the toggle button', async () => {
    const user = userEvent.setup();
    render(<Header />);

    const toggleButton = screen.getByRole('button', { name: /toggle menu/i });
    await user.click(toggleButton);

    // After opening, aria-expanded should be true
    expect(toggleButton).toHaveAttribute('aria-expanded', 'true');

    // The mobile menu renders a duplicate set of nav links (one per navLinks entry).
    // There are now two sets: desktop (hidden via CSS) and mobile (rendered in DOM).
    const features = screen.getAllByRole('link', { name: 'nav.features' });
    expect(features.length).toBeGreaterThanOrEqual(2);
  });

  it('mobile menu closes after a second click on the toggle button', async () => {
    const user = userEvent.setup();
    render(<Header />);

    const toggleButton = screen.getByRole('button', { name: /toggle menu/i });

    // Open
    await user.click(toggleButton);
    expect(toggleButton).toHaveAttribute('aria-expanded', 'true');

    // Close
    await user.click(toggleButton);
    expect(toggleButton).toHaveAttribute('aria-expanded', 'false');
  });

  it('renders the NetworkStatus component', () => {
    render(<Header />);

    expect(screen.getByTestId('network-status')).toBeInTheDocument();
  });
});
