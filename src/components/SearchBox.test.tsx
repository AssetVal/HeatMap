// src/components/SearchBox.test.tsx
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@solidjs/testing-library';
import { Show } from 'solid-js';
import { SearchBox } from './SearchBox';
import { useToast } from '../hooks/useToast';

vi.mock('../hooks/useToast', () => ({
  useToast: () => ({
    error: vi.fn(),
    info: vi.fn(),
    success: vi.fn(),
  }),
}));

describe('SearchBox', () => {
  const mockCounties = [
    {
      type: 'Feature' as const,
      properties: {
        NAME: 'Test County',
        STATE_NAME: 'California',
        density: 100,
        population: 50000,
      },
      geometry: {
        type: 'Polygon' as const,
        coordinates: [[[0, 0]]],
      },
    },
  ];

  const mockProps = {
    counties: mockCounties,
    onSelect: vi.fn(),
    onHighlight: vi.fn(),
  };

  beforeEach(() => {
    cleanup();
    localStorage.clear();
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
    localStorage.clear();
    vi.clearAllMocks();
  });

  it('renders search input', () => {
    render(() => (
      <Show when={true}>
        <SearchBox {...mockProps} />
      </Show>
    ));

    const input = screen.getByPlaceholderText('Search by county or ZIP...');
    expect(input).toBeTruthy();
  });

  it('shows loading state while searching', async () => {
    render(() => (
      <Show when={true}>
        <SearchBox {...mockProps} />
      </Show>
    ));

    const input = screen.getByPlaceholderText('Search by county or ZIP...');
    fireEvent.input(input, { target: { value: 'Test County' } });

    const spinner = document.querySelector('.animate-spin');
    expect(spinner).toBeTruthy();
  });

  it('filters counties based on input', async () => {
    render(() => (
      <Show when={true}>
        <SearchBox {...mockProps} />
      </Show>
    ));

    const input = screen.getByPlaceholderText('Search by county or ZIP...');
    fireEvent.input(input, { target: { value: 'Tes' } });

    // Wait for debounced search
    await new Promise((resolve) => setTimeout(resolve, 600));

    const result = screen.getByText('Test County, CA');
    expect(result).toBeTruthy();
  });

  it('handles keyboard navigation', async () => {
    render(() => (
      <Show when={true}>
        <SearchBox {...mockProps} />
      </Show>
    ));

    const input = screen.getByPlaceholderText('Search by county or ZIP...');
    fireEvent.input(input, { target: { value: 'Test' } });

    // Wait for debounced search
    await new Promise((resolve) => setTimeout(resolve, 600));

    fireEvent.keyDown(input, { key: 'ArrowDown' });
    const highlightedItem = document.querySelector('.bg-gray-100');
    expect(highlightedItem).toBeTruthy();
  });

  it('clears input when clear button is clicked', () => {
    render(() => (
      <Show when={true}>
        <SearchBox {...mockProps} />
      </Show>
    ));

    const input = screen.getByPlaceholderText('Search by county or ZIP...');
    fireEvent.input(input, { target: { value: 'Test' } });

    const clearButton = screen.getByText('×');
    fireEvent.click(clearButton);

    expect(input.value).toBe('');
  });

  it('saves search history', async () => {
    render(() => (
      <Show when={true}>
        <SearchBox {...mockProps} />
      </Show>
    ));

    const input = screen.getByPlaceholderText('Search by county or ZIP...');
    fireEvent.input(input, { target: { value: 'Test' } });

    // Wait for debounced search
    await new Promise((resolve) => setTimeout(resolve, 600));

    const result = screen.getByText('Test County, CA');
    fireEvent.click(result);

    // Check localStorage
    const history = JSON.parse(localStorage.getItem('searchHistory') || '[]');
    expect(history.length).toBeGreaterThan(0);
  });
});
