import { Component, ErrorBoundary as SolidErrorBoundary, Show } from 'solid-js';
import { Button } from './Button';

interface Props {
  children: any;
  fallback?: Component<{ error: Error }>;
}

export function ErrorBoundary(props: Props) {
  return (
    <SolidErrorBoundary
      fallback={(err: Error) => (
        <div class="p-8 flex flex-col items-center justify-center">
          <div class="bg-red-50 border border-red-200 rounded-lg p-6 max-w-2xl w-full">
            <h2 class="text-xl font-semibold text-red-700 mb-4">
              Something went wrong
            </h2>
            <div class="bg-white rounded p-4 mb-4 overflow-auto">
              <pre class="text-sm text-red-600 whitespace-pre-wrap">
                {err.message}
              </pre>
              <Show when={err.stack}>
                <details class="mt-2">
                  <summary class="text-sm text-gray-600 cursor-pointer hover:text-gray-800">
                    Stack trace
                  </summary>
                  <pre class="mt-2 text-xs text-gray-600 whitespace-pre-wrap">
                    {err.stack}
                  </pre>
                </details>
              </Show>
            </div>
            <Button
              onClick={() => window.location.reload()}
              class="w-full bg-red-600 hover:bg-red-700 text-white"
            >
              Reload Page
            </Button>
          </div>
        </div>
      )}
    >
      {props.children}
    </SolidErrorBoundary>
  );
}
