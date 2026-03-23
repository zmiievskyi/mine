import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NetworkStatus } from '../NetworkStatus';

// Mock fetch globally
const mockFetch = jest.fn();
global.fetch = mockFetch;

/**
 * Helper to create a mock /api/network-status response.
 * The component makes a single fetch to this endpoint.
 */
function createApiResponse(overrides: {
  status?: string;
  blockHeight?: number | null;
  blockAge?: number | null;
  epochId?: number | null;
  updatedAt?: string;
} = {}) {
  return {
    status: overrides.status ?? 'live',
    blockHeight: overrides.blockHeight ?? 1000000,
    blockAge: overrides.blockAge ?? 30,
    epochId: overrides.epochId ?? 10,
    updatedAt: overrides.updatedAt ?? new Date().toISOString(),
  };
}

/** Wraps a payload in a mock fetch Response. */
function mockResponse(payload: unknown, ok = true) {
  return Promise.resolve({
    ok,
    json: () => Promise.resolve(payload),
  });
}

describe('NetworkStatus', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
  });

  afterEach(() => {
    act(() => {
      jest.runOnlyPendingTimers();
    });
    jest.useRealTimers();
  });

  it('renders with placeholder values initially', () => {
    mockFetch.mockImplementation(() => mockResponse(createApiResponse()));

    render(<NetworkStatus />);

    // Status should show Unknown initially (before fetch resolves)
    expect(screen.getByText('Unknown')).toBeInTheDocument();

    // Placeholder dashes should be shown
    const placeholders = screen.getAllByText('—');
    expect(placeholders.length).toBeGreaterThan(0);
  });

  it('displays correct data after successful fetch', async () => {
    mockFetch.mockReturnValueOnce(
      mockResponse(createApiResponse({
        status: 'live',
        blockHeight: 1234567,
        blockAge: 30,
        epochId: 42,
      }))
    );

    render(<NetworkStatus />);

    await waitFor(() => {
      expect(screen.getByText('Live')).toBeInTheDocument();
    });

    expect(screen.getByText('1,234,567')).toBeInTheDocument();
    expect(screen.getByText('42')).toBeInTheDocument();
    expect(screen.getByText('30s')).toBeInTheDocument();
  });

  it('shows "Live" status when block age ≤ 120s and not catching up', async () => {
    mockFetch.mockReturnValueOnce(
      mockResponse(createApiResponse({ status: 'live', blockAge: 60 }))
    );

    render(<NetworkStatus />);

    await waitFor(() => {
      expect(screen.getByText('Live')).toBeInTheDocument();
    });

    const liveElement = screen.getByText('Live');
    expect(liveElement).toHaveClass('text-emerald-400');
  });

  it('shows "Syncing" status when catching_up is true', async () => {
    mockFetch.mockReturnValueOnce(
      mockResponse(createApiResponse({ status: 'syncing', blockAge: 30 }))
    );

    render(<NetworkStatus />);

    await waitFor(() => {
      expect(screen.getByText('Syncing')).toBeInTheDocument();
    });

    const syncingElement = screen.getByText('Syncing');
    expect(syncingElement).toHaveClass('text-amber-400');
  });

  it('shows "Stale" status when block age > 120s', async () => {
    mockFetch.mockReturnValueOnce(
      mockResponse(createApiResponse({ status: 'stale', blockAge: 180 }))
    );

    render(<NetworkStatus />);

    await waitFor(() => {
      expect(screen.getByText('Stale')).toBeInTheDocument();
    });

    const staleElement = screen.getByText('Stale');
    expect(staleElement).toHaveClass('text-red-400');
  });

  it('shows "Unknown" status when API fails', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Network error'));

    render(<NetworkStatus />);

    await waitFor(() => {
      expect(screen.getByText('Unknown')).toBeInTheDocument();
    });

    const unknownElement = screen.getByText('Unknown');
    expect(unknownElement).toHaveClass('text-zinc-400');
  });

  it('shows "Unknown" status when response is not ok', async () => {
    mockFetch.mockReturnValueOnce(
      mockResponse({}, false)
    );

    render(<NetworkStatus />);

    await waitFor(() => {
      expect(screen.getByText('Unknown')).toBeInTheDocument();
    });
  });

  it('manual refresh button triggers new fetch', async () => {
    // Initial fetch
    mockFetch
      .mockReturnValueOnce(
        mockResponse(createApiResponse({ blockHeight: 1000000, epochId: 10 }))
      )
      // Refresh fetch with updated data
      .mockReturnValueOnce(
        mockResponse(createApiResponse({ blockHeight: 1000100, epochId: 11 }))
      );

    const user = userEvent.setup({ delay: null });
    render(<NetworkStatus />);

    await waitFor(() => {
      expect(screen.getByText('1,000,000')).toBeInTheDocument();
    });

    const refreshButton = screen.getByRole('button', { name: /refresh/i });
    await user.click(refreshButton);

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    await waitFor(() => {
      expect(screen.getByText('1,000,100')).toBeInTheDocument();
    });
  });

  it('polls data every 20 seconds', async () => {
    mockFetch.mockImplementation(() =>
      mockResponse(createApiResponse())
    );

    render(<NetworkStatus />);

    // Wait for initial fetch
    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    // Advance time by 20 seconds
    act(() => {
      jest.advanceTimersByTime(20000);
    });

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    // Advance time by another 20 seconds
    act(() => {
      jest.advanceTimersByTime(20000);
    });

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledTimes(3);
    });
  });

  it('displays formatted block age correctly', async () => {
    const testCases = [
      { blockAge: 30, expected: '30s' },
      { blockAge: 90, expected: /1m 30s/ },
      { blockAge: 3660, expected: /1h 1m/ },
    ];

    for (const testCase of testCases) {
      mockFetch.mockClear();
      mockFetch.mockReturnValueOnce(
        mockResponse(createApiResponse({ status: 'live', blockAge: testCase.blockAge }))
      );

      const { unmount } = render(<NetworkStatus />);

      await waitFor(() => {
        expect(screen.getByText(testCase.expected)).toBeInTheDocument();
      });

      await act(async () => {
        jest.advanceTimersByTime(300);
      });

      unmount();
    }
  });

  it('displays formatted time correctly', async () => {
    mockFetch.mockReturnValueOnce(
      mockResponse(createApiResponse())
    );

    render(<NetworkStatus />);

    await waitFor(() => {
      expect(screen.getByText('Live')).toBeInTheDocument();
    });

    // Check that updated time is shown in HH:MM:SS format
    const timeRegex = /\d{2}:\d{2}:\d{2}/;
    expect(screen.getByText(timeRegex)).toBeInTheDocument();
  });

  it('clears interval on unmount', async () => {
    mockFetch.mockImplementation(() =>
      mockResponse(createApiResponse())
    );

    const { unmount } = render(<NetworkStatus />);

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    await act(async () => {
      jest.advanceTimersByTime(300);
    });

    const callCountBeforeUnmount = mockFetch.mock.calls.length;
    unmount();

    act(() => {
      jest.advanceTimersByTime(20000);
    });

    expect(mockFetch).toHaveBeenCalledTimes(callCountBeforeUnmount);
  });

  it('has correct accessibility attributes', async () => {
    mockFetch.mockReturnValueOnce(
      mockResponse(createApiResponse())
    );

    const { container } = render(<NetworkStatus />);

    await waitFor(() => {
      expect(screen.getByText('Live')).toBeInTheDocument();
    });

    const refreshButton = screen.getByRole('button', { name: /refresh network status/i });
    expect(refreshButton).toHaveAttribute('aria-label', 'Refresh network status');

    const elementsWithTitle = container.querySelectorAll('[title]');
    expect(elementsWithTitle.length).toBeGreaterThan(0);
  });

  it('fetches from /api/network-status endpoint', async () => {
    mockFetch.mockReturnValueOnce(
      mockResponse(createApiResponse())
    );

    render(<NetworkStatus />);

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    expect(mockFetch).toHaveBeenCalledWith(
      '/api/network-status',
      expect.objectContaining({ cache: 'no-store' })
    );
  });
});
