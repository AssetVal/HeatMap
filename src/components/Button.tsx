import { Component, JSX, Show, splitProps } from 'solid-js';
import { Dynamic } from 'solid-js/web';

interface ButtonProps extends JSX.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  isLoading?: boolean;
  leftIcon?: Component;
  rightIcon?: Component;
  as?: 'button' | 'a';
  href?: string;
}

const variantStyles = {
  primary: 'bg-sky-600 hover:bg-sky-700 text-white',
  secondary: 'bg-gray-100 hover:bg-gray-200 text-gray-900',
  danger: 'bg-red-600 hover:bg-red-700 text-white',
  ghost: 'hover:bg-gray-100 text-gray-700',
};

const sizeStyles = {
  sm: 'px-3 py-1.5 text-sm',
  md: 'px-4 py-2',
  lg: 'px-6 py-3 text-lg',
};

export function Button(props: ButtonProps) {
  const [local, rest] = splitProps(props, [
    'children',
    'class',
    'variant',
    'size',
    'isLoading',
    'leftIcon',
    'rightIcon',
    'as',
    'disabled',
  ]);

  const baseClass = () =>
    [
      'inline-flex items-center justify-center rounded font-medium transition-colors',
      'focus:outline-none focus:ring-2 focus:ring-sky-500 focus:ring-offset-2',
      'disabled:opacity-50 disabled:cursor-not-allowed',
      variantStyles[local.variant || 'primary'],
      sizeStyles[local.size || 'md'],
      local.class,
    ]
      .filter(Boolean)
      .join(' ');

  return (
    <Dynamic
      component={local.as || 'button'}
      class={baseClass()}
      disabled={local.disabled || local.isLoading}
      {...rest}
    >
      <Show when={local.isLoading}>
        <svg
          class="animate-spin -ml-1 mr-2 h-4 w-4"
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
        >
          <circle
            class="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            stroke-width="4"
          />
          <path
            class="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
          />
        </svg>
      </Show>
      <Show when={local.leftIcon && !local.isLoading}>
        <Dynamic
          component={local.leftIcon}
          // @ts-ignore
          class={{ 'mr-2 -ml-1 h-4 w-4': true }}
        />
      </Show>
      {local.children}
      <Show when={local.rightIcon}>
        <Dynamic
          component={local.rightIcon}
          // @ts-ignore
          class={{ 'ml-2 -mr-1 h-4 w-4': true }}
        />
      </Show>
    </Dynamic>
  );
}
