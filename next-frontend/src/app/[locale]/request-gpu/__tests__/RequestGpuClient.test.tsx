import { render, screen, act } from '@testing-library/react';
import { RequestGpuClient } from '../RequestGpuClient';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

jest.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

// Default: GPU param present. Individual tests override this where needed.
const mockSearchParams = new URLSearchParams('gpu=NVIDIA H100');
jest.mock('next/navigation', () => ({
  // Must use a factory function — jest.mock is hoisted before imports.
  // The returned value is read at call time, so module-level mutations work.
  useSearchParams: jest.fn(),
}));

jest.mock('@/i18n/navigation', () => ({
  Link: ({ children, href, ...props }: any) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

// MutationObserver is used inside RequestGpuForm to detect when the HubSpot
// form loads. We stub it to a no-op so it doesn't throw in jsdom.
class MockMutationObserver {
  observe = jest.fn();
  disconnect = jest.fn();
  constructor(public callback: MutationCallback) {}
}
global.MutationObserver = MockMutationObserver as unknown as typeof MutationObserver;

// The component calls window.history.replaceState to set HubSpot pre-fill
// params in the URL. Stub it so we can assert on the calls without triggering
// actual navigation.
const replaceStateMock = jest.fn();
Object.defineProperty(window, 'history', {
  value: { replaceState: replaceStateMock },
  writable: true,
});

// jsdom's default window.location.href is 'http://localhost/' — a valid
// absolute URL. addGpuToUrlParams does `new URL(window.location.href)` and
// only modifies search params, so the base URL does not matter for our tests.

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// RequestGpuForm is rendered inside <Suspense>. act() lets React flush the
// suspended subtree before we make assertions.
async function renderAndSettle() {
  let utils: ReturnType<typeof render>;
  await act(async () => {
    utils = render(<RequestGpuClient />);
  });
  return utils!;
}

// Convenience: assert that replaceState was called with a URL containing the
// expected HubSpot form parameters.
function expectReplaceStateCalledWithGpuValue(expectedValue: string) {
  expect(replaceStateMock).toHaveBeenCalled();
  const calledUrl: string = replaceStateMock.mock.calls[0][2];
  const params = new URL(calledUrl).searchParams;
  expect(params.get('form_gonka_preffered_configuration')).toBe(expectedValue);
  expect(params.get('form_gonka_servers_number')).toBe('1');
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('RequestGpuClient', () => {
  const { useSearchParams } = require('next/navigation');

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    // Default: a GPU is selected
    (useSearchParams as jest.Mock).mockReturnValue(mockSearchParams);
  });

  afterEach(() => {
    act(() => {
      jest.runOnlyPendingTimers();
    });
    jest.useRealTimers();
  });

  // ---- Structure / navigation ----

  it('renders a back link to the landing page', async () => {
    await renderAndSettle();

    const backLink = screen.getByRole('link', { name: /backtohome/i });
    expect(backLink).toBeInTheDocument();
    expect(backLink).toHaveAttribute('href', '/');
  });

  it('renders the page title', async () => {
    await renderAndSettle();

    // useTranslations returns the key as-is, so the heading text is 'title'
    expect(screen.getByRole('heading', { name: 'title' })).toBeInTheDocument();
  });

  // ---- GPU param display ----

  it('shows the selected GPU name when gpu param is present', async () => {
    // mockSearchParams has 'gpu=NVIDIA H100' (set in beforeEach)
    await renderAndSettle();

    expect(screen.getByText('NVIDIA H100')).toBeInTheDocument();
  });

  it('does not show GPU selection text when gpu param is absent', async () => {
    (useSearchParams as jest.Mock).mockReturnValue(new URLSearchParams(''));

    await renderAndSettle();

    expect(screen.queryByText('NVIDIA H100')).not.toBeInTheDocument();
    // The paragraph wrapping t('selected') + gpuType should not render at all
    expect(screen.queryByText('selected')).not.toBeInTheDocument();
  });

  // ---- Loading state ----

  it('shows a loading spinner immediately after mount', async () => {
    await renderAndSettle();

    // Translation mock returns the key, so the label text is 'loading'
    expect(screen.getByText('loading')).toBeInTheDocument();
  });

  // ---- GPU mapping (indirect via window.history.replaceState) ----
  // getHubSpotGpuValue and addGpuToUrlParams are not exported, so we verify
  // their combined effect: the URL written to replaceState must contain the
  // correct HubSpot pre-fill parameter for each GPU type.

  it('maps "NVIDIA A100" to HubSpot value "8 x A100"', async () => {
    (useSearchParams as jest.Mock).mockReturnValue(
      new URLSearchParams('gpu=NVIDIA A100')
    );

    await renderAndSettle();
    expectReplaceStateCalledWithGpuValue('8 x A100');
  });

  it('maps "H100" to HubSpot value "8 x H100"', async () => {
    (useSearchParams as jest.Mock).mockReturnValue(
      new URLSearchParams('gpu=H100')
    );

    await renderAndSettle();
    expectReplaceStateCalledWithGpuValue('8 x H100');
  });

  it('maps "NVIDIA H200" to HubSpot value "8 x H200"', async () => {
    (useSearchParams as jest.Mock).mockReturnValue(
      new URLSearchParams('gpu=NVIDIA H200')
    );

    await renderAndSettle();
    expectReplaceStateCalledWithGpuValue('8 x H200');
  });

  it('maps "B200" to HubSpot value "8 x B200"', async () => {
    (useSearchParams as jest.Mock).mockReturnValue(
      new URLSearchParams('gpu=B200')
    );

    await renderAndSettle();
    expectReplaceStateCalledWithGpuValue('8 x B200');
  });

  it('does not call replaceState for an unknown GPU type ("NVIDIA T4")', async () => {
    (useSearchParams as jest.Mock).mockReturnValue(
      new URLSearchParams('gpu=NVIDIA T4')
    );

    await renderAndSettle();
    // getHubSpotGpuValue returns null → addGpuToUrlParams exits early
    expect(replaceStateMock).not.toHaveBeenCalled();
  });
});
