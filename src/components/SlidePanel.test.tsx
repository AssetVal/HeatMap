// src/components/SlidePanel.test.tsx
import { cleanup, fireEvent, render, screen } from '@solidjs/testing-library';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SlidePanel } from './SlidePanel';

describe('SlidePanel', () => {
  const onClose = vi.fn();

  beforeEach(() => {
    cleanup();
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('renders when isOpen is true', () => {
    render(() => (
      <SlidePanel isOpen={true} onClose={onClose}>
        <div data-testid="panel-content">Content</div>
      </SlidePanel>
    ));

    const panel = screen.getByTestId('panel-content');
    expect(panel).toBeTruthy();
  });

  it('does not render when isOpen is false', () => {
    render(() => (
      <SlidePanel isOpen={false} onClose={onClose}>
        <div data-testid="panel-content">Content</div>
      </SlidePanel>
    ));

    const panel = screen.queryByTestId('panel-content');
    expect(panel).toBeNull();
  });

  it('calls onClose when overlay is clicked', () => {
    render(() => (
      <SlidePanel isOpen={true} onClose={onClose}>
        <div>Content</div>
      </SlidePanel>
    ));

    const overlay = document.querySelector('.bg-black.bg-opacity-50');
    fireEvent.click(overlay!);
    expect(onClose).toHaveBeenCalled();
  });

  it('calls onClose when escape key is pressed', () => {
    render(() => (
      <SlidePanel isOpen={true} onClose={onClose}>
        <div>Content</div>
      </SlidePanel>
    ));

    // Get the overlay element and fire the event on it
    const overlay = document.querySelector('.bg-black.bg-opacity-50');
    fireEvent.keyDown(overlay!, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('calls onClose when close button is clicked', () => {
    render(() => (
      <SlidePanel isOpen={true} onClose={onClose}>
        <div>Content</div>
      </SlidePanel>
    ));

    const closeButton = screen.getByText('✕');
    fireEvent.click(closeButton);
    expect(onClose).toHaveBeenCalled();
  });

  it('prevents event propagation when clicking panel content', () => {
    render(() => (
      <SlidePanel isOpen={true} onClose={onClose}>
        <div data-testid="panel-content">Content</div>
      </SlidePanel>
    ));

    const panelContent = document.querySelector('.w-96.bg-white');
    fireEvent.click(panelContent!);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('renders multiple children correctly', () => {
    render(() => (
      <SlidePanel isOpen={true} onClose={onClose}>
        <div data-testid="child-1">Child 1</div>
        <div data-testid="child-2">Child 2</div>
      </SlidePanel>
    ));

    expect(screen.getByTestId('child-1')).toBeTruthy();
    expect(screen.getByTestId('child-2')).toBeTruthy();
  });

  it('has correct styling classes', () => {
    render(() => (
      <SlidePanel isOpen={true} onClose={onClose}>
        <div>Content</div>
      </SlidePanel>
    ));

    const panel = document.querySelector('.w-96.bg-white');
    expect(panel).toBeTruthy();
    expect(panel?.classList.contains('transform')).toBe(true);
    expect(panel?.classList.contains('transition-transform')).toBe(true);
  });
});
