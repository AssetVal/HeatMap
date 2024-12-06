import { For, createEffect, createSignal, type JSX } from 'solid-js';

interface VirtualListProps<T> {
  items: T[];
  itemHeight: number;
  height: string;
  renderItem: (item: T, index: number) => JSX.Element;
}

export function VirtualList<T>(props: VirtualListProps<T>) {
  const [containerRef, setContainerRef] = createSignal<HTMLDivElement>();
  const [scrollTop, setScrollTop] = createSignal(0);
  const [visibleItems, setVisibleItems] = createSignal<{
    start: number;
    end: number;
  }>({ start: 0, end: 0 });

  createEffect(() => {
    if (!containerRef()) return;

    // Calculate visible range
    const containerHeight = containerRef()!.clientHeight;
    const totalItems = props.items.length;
    const start = Math.floor(scrollTop() / props.itemHeight);
    const end = Math.min(
      start + Math.ceil(containerHeight / props.itemHeight) + 1,
      totalItems,
    );

    setVisibleItems({ start, end });
  });

  const handleScroll = (e: Event) => {
    const target = e.target as HTMLDivElement;
    setScrollTop(target.scrollTop);
  };

  return (
    <div
      ref={setContainerRef}
      onScroll={handleScroll}
      class="overflow-auto relative"
      style={{ height: props.height }}
    >
      <div
        style={{
          height: `${props.items.length * props.itemHeight}px`,
          position: 'relative',
        }}
        class="bg-slate-50"
      >
        <For each={props.items.slice(visibleItems().start, visibleItems().end)}>
          {(item, index) => (
            <div
              class="text-slate-800"
              style={{
                position: 'absolute',
                top: `${(visibleItems().start + index()) * props.itemHeight}px`,
                height: `${props.itemHeight}px`,
                left: 0,
                right: 0,
              }}
            >
              {props.renderItem(item, visibleItems().start + index())}
            </div>
          )}
        </For>
      </div>
    </div>
  );
}
