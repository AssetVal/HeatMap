// src/components/Button.test.tsx
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@solidjs/testing-library';
import { Show } from 'solid-js';
import { Button } from './Button';

describe('Button', () => {
  it('renders basic button', () => {
    render(() => (
      <Show when={true}>
        <Button>Click me</Button>
      </Show>
    ));
    const button = screen.getByText('Click me');
    expect(button).toBeTruthy();
    expect(button.textContent).toBe('Click me');
  });

  it('applies variant styles', () => {
    render(() => (
      <Show when={true}>
        <Button variant="secondary">Secondary</Button>
      </Show>
    ));
    const button = screen.getByText('Secondary');
    expect(button.className).toContain('bg-gray-100');
  });

  it('applies size styles', () => {
    render(() => (
      <Show when={true}>
        <Button size="lg">Large</Button>
      </Show>
    ));
    const button = screen.getByText('Large');
    expect(button.className).toContain('px-6 py-3 text-lg');
  });

  it('shows loading state', () => {
    render(() => (
      <Show when={true}>
        <Button isLoading>Loading</Button>
      </Show>
    ));
    const spinner = document.querySelector('svg.animate-spin');
    expect(spinner).toBeTruthy();
  });

  it('renders left icon', () => {
    const TestIcon = () => <svg data-testid="test-icon" />;
    render(() => (
      <Show when={true}>
        <Button leftIcon={TestIcon}>With Icon</Button>
      </Show>
    ));
    const icon = screen.getByTestId('test-icon');
    expect(icon).toBeTruthy();
  });

  it('handles disabled state', () => {
    render(() => (
      <Show when={true}>
        <Button disabled>Disabled</Button>
      </Show>
    ));
    const button = screen.getByText('Disabled');
    // @ts-expect-error disabled is not a valid property on HTMLButtonElement
    expect(button.disabled).toBe(true);
    expect(button.className).toContain('disabled:opacity-50');
  });

  // Additional tests
  it('renders right icon', () => {
    const TestIcon = () => <svg data-testid="test-right-icon" />;
    render(() => (
      <Show when={true}>
        <Button rightIcon={TestIcon}>With Right Icon</Button>
      </Show>
    ));
    const icon = screen.getByTestId('test-right-icon');
    expect(icon).toBeTruthy();
  });

  it('renders as anchor when as="a" prop is provided', () => {
    render(() => (
      <Show when={true}>
        <Button as="a" href="/test">
          Link Button
        </Button>
      </Show>
    ));
    const anchor = screen.getByText('Link Button');
    expect(anchor.tagName.toLowerCase()).toBe('a');
    expect(anchor.getAttribute('href')).toBe('/test');
  });

  it('applies danger variant styles', () => {
    render(() => (
      <Show when={true}>
        <Button variant="danger">Danger</Button>
      </Show>
    ));
    const button = screen.getByText('Danger');
    expect(button.className).toContain('bg-red-600');
  });

  it('applies ghost variant styles', () => {
    render(() => (
      <Show when={true}>
        <Button variant="ghost">Ghost</Button>
      </Show>
    ));
    const button = screen.getByText('Ghost');
    expect(button.className).toContain('hover:bg-gray-100');
  });
});
