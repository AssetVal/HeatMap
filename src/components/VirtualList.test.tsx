// src/components/VirtualList.test.tsx
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@solidjs/testing-library';
import { Show } from 'solid-js';
import { VirtualList } from './VirtualList';

describe('VirtualList', () => {
  const mockItems = Array.from({ length: 100 }, (_, i) => `Item ${i}`);

  beforeEach(() => {
    cleanup(); // Clean up before each test
  });

  afterEach(() => {
    cleanup(); // Clean up after each test
    vi.clearAllMocks(); // Clear all mocks
  });

  it('renders virtual list container', () => {
    render(() => (
      <Show when={true}>
        <VirtualList
          items={mockItems}
          itemHeight={40}
          height="400px"
          renderItem={(item) => <div data-testid="list-item">{item}</div>}
        />
      </Show>
    ));

    const container = document.querySelector(
      '.overflow-auto',
    ) as HTMLDivElement;
    expect(container).toBeTruthy();
    expect(container?.style.height).toBe('400px');
  });

  it('renders initial visible items', () => {
    render(() => (
      <Show when={true}>
        <VirtualList
          items={mockItems}
          itemHeight={40}
          height="400px"
          renderItem={(item) => <div data-testid="list-item">{item}</div>}
        />
      </Show>
    ));

    const items = screen.getAllByTestId('list-item');
    // With 400px height and 40px item height, we should see ~10 items plus buffer
    expect(items.length).toBeGreaterThan(0);
    expect(items.length).toBeLessThanOrEqual(12); // 10 visible + buffer
  });

  it('handles empty items array', () => {
    render(() => (
      <Show when={true}>
        <VirtualList
          items={[]}
          itemHeight={40}
          height="400px"
          renderItem={(item) => <div data-testid="list-item">{item}</div>}
        />
      </Show>
    ));

    const items = screen.queryAllByTestId('list-item');
    expect(items.length).toBe(0);
  });

  it('updates visible items on scroll', async () => {
    render(() => (
      <Show when={true}>
        <VirtualList
          items={mockItems}
          itemHeight={40}
          height="400px"
          renderItem={(item) => <div data-testid="list-item">{item}</div>}
        />
      </Show>
    ));

    const container = document.querySelector(
      '.overflow-auto',
    ) as HTMLDivElement;

    // Initial items
    const initialItems = screen.getAllByTestId('list-item');
    const initialFirstItem = initialItems[0].textContent;

    // Scroll down
    fireEvent.scroll(container, { target: { scrollTop: 400 } });

    // Get new items
    const newItems = screen.getAllByTestId('list-item');
    const newFirstItem = newItems[0].textContent;

    expect(newFirstItem).not.toBe(initialFirstItem);
  });

  it('renders items with correct positioning', () => {
    render(() => (
      <Show when={true}>
        <VirtualList
          items={mockItems}
          itemHeight={40}
          height="400px"
          renderItem={(item) => <div data-testid="list-item">{item}</div>}
        />
      </Show>
    ));

    const itemContainers = document.querySelectorAll(
      '[style*="position: absolute"]',
    );
    itemContainers.forEach((container, index) => {
      expect(container.getAttribute('style')).toContain(`top: ${index * 40}px`);
      expect(container.getAttribute('style')).toContain('height: 40px');
    });
  });

  it('calls renderItem with correct parameters', () => {
    const renderItem = vi.fn((item: string) => (
      <div data-testid="list-item">{item}</div>
    ));

    render(() => (
      <Show when={true}>
        <VirtualList
          items={mockItems}
          itemHeight={40}
          height="400px"
          renderItem={renderItem}
        />
      </Show>
    ));

    expect(renderItem).toHaveBeenCalled();
    expect(renderItem.mock.calls[0][0]).toBe('Item 0');
    // @ts-expect-error second argument is a number
    expect(typeof renderItem.mock.calls[0][1]).toBe('number');
  });
});
