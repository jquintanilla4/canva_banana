import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PromptBarPicker } from '../PromptBarPicker';
import { OVERLAY_LAYER_CLASS_NAMES } from '../../utils/overlayLayers';

const ORIGINAL_INNER_WIDTH = window.innerWidth;
const ORIGINAL_INNER_HEIGHT = window.innerHeight;

const rect = (left: number, top: number, width: number, height: number): DOMRect => ({
  x: left,
  y: top,
  left,
  top,
  right: left + width,
  bottom: top + height,
  width,
  height,
  toJSON: () => ({}),
});

const installRectMocks = ({
  triggerRect,
  listboxRect,
}: {
  triggerRect: DOMRect | (() => DOMRect);
  listboxRect: DOMRect | (() => DOMRect);
}) => {
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function getBoundingClientRect() {
    if (this.getAttribute('role') === 'combobox') {
      return typeof triggerRect === 'function' ? triggerRect() : triggerRect;
    }
    if (this.getAttribute('role') === 'listbox') {
      return typeof listboxRect === 'function' ? listboxRect() : listboxRect;
    }
    return rect(0, 0, 0, 0);
  });
};

const renderPicker = (onChange = vi.fn()) => render(
  <PromptBarPicker
    id="test-picker"
    ariaLabel="Test picker"
    options={[
      { value: 'alpha', label: 'Alpha' },
      { value: 'beta', label: 'Beta', disabled: true },
      { value: 'gamma', label: 'Gamma' },
    ]}
    value="alpha"
    onChange={onChange}
    disabled={false}
  />
);

describe('PromptBarPicker', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    document.body.classList.remove('picker-body-shift');
    document.documentElement.classList.remove('picker-root-shift');
    Object.defineProperty(window, 'innerWidth', { configurable: true, writable: true, value: ORIGINAL_INNER_WIDTH });
    Object.defineProperty(window, 'innerHeight', { configurable: true, writable: true, value: ORIGINAL_INNER_HEIGHT });
  });

  it('portals its listbox above the trigger and selects an option', () => {
    installRectMocks({
      triggerRect: rect(100, 500, 120, 30),
      listboxRect: rect(0, 0, 220, 180),
    });
    const onChange = vi.fn();
    renderPicker(onChange);

    const trigger = screen.getByRole('combobox', { name: 'Test picker' });
    expect(trigger.getAttribute('aria-controls')).toBeNull();
    fireEvent.click(trigger);

    const listbox = screen.getByRole('listbox', { name: 'Test picker' });
    expect(trigger.getAttribute('aria-controls')).toBe(listbox.id);
    expect(listbox.parentElement).toBe(document.body);
    expect(listbox.className).toContain(OVERLAY_LAYER_CLASS_NAMES.anchoredPopover);
    expect(listbox.className).not.toContain(OVERLAY_LAYER_CLASS_NAMES.blockingModal);
    expect(listbox.dataset.placement).toBe('top');
    expect(listbox.style.left).toBe('100px');
    expect(listbox.style.top).toBe('314px');
    expect(parseFloat(listbox.style.top) + 180).toBeLessThan(500);

    fireEvent.click(screen.getByRole('option', { name: 'Gamma' }));
    expect(onChange).toHaveBeenCalledWith('gamma');
    expect(screen.queryByRole('listbox', { name: 'Test picker' })).toBeNull();
    expect(trigger.getAttribute('aria-controls')).toBeNull();
  });

  it('keeps pointer focus on the combobox until an option click commits', () => {
    installRectMocks({
      triggerRect: rect(100, 500, 120, 30),
      listboxRect: rect(0, 0, 220, 180),
    });
    const onChange = vi.fn();
    renderPicker(onChange);
    const trigger = screen.getByRole('combobox', { name: 'Test picker' });
    trigger.focus();
    fireEvent.click(trigger);

    const gamma = screen.getByRole('option', { name: 'Gamma' });
    expect(fireEvent.mouseDown(gamma)).toBe(false); // Preventing the native default keeps focus on the trigger.
    expect(document.activeElement).toBe(trigger);

    fireEvent.click(gamma);
    expect(onChange).toHaveBeenCalledWith('gamma');
    expect(document.activeElement).toBe(trigger);
  });

  it('dismisses the listbox when focus moves outside programmatically', () => {
    installRectMocks({
      triggerRect: rect(100, 500, 120, 30),
      listboxRect: rect(0, 0, 220, 180),
    });
    render(
      <div>
        <PromptBarPicker
          id="test-picker"
          ariaLabel="Test picker"
          options={[{ value: 'alpha', label: 'Alpha' }]}
          value="alpha"
          onChange={vi.fn()}
          disabled={false}
        />
        <button type="button">Next control</button>
      </div>,
    );

    const trigger = screen.getByRole('combobox', { name: 'Test picker' });
    fireEvent.click(trigger);
    expect(screen.getByRole('listbox', { name: 'Test picker' })).toBeTruthy();

    act(() => screen.getByRole('button', { name: 'Next control' }).focus());

    expect(screen.queryByRole('listbox', { name: 'Test picker' })).toBeNull();
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
  });

  it('dismisses the listbox before outside controls stop pointer propagation', () => {
    installRectMocks({
      triggerRect: rect(100, 500, 120, 30),
      listboxRect: rect(0, 0, 220, 180),
    });
    render(
      <div>
        <PromptBarPicker
          id="test-picker"
          ariaLabel="Test picker"
          options={[{ value: 'alpha', label: 'Alpha' }]}
          value="alpha"
          onChange={vi.fn()}
          disabled={false}
        />
        <div
          data-testid="stopping-outside-control"
          onPointerDown={event => event.stopPropagation()}
        >
          Outside control
        </div>
      </div>,
    );

    fireEvent.click(screen.getByRole('combobox', { name: 'Test picker' }));
    expect(screen.getByRole('listbox', { name: 'Test picker' }).dataset.placement).toBe('top');

    fireEvent.pointerDown(screen.getByTestId('stopping-outside-control'));

    expect(screen.queryByRole('listbox', { name: 'Test picker' })).toBeNull();
  });

  it('exposes the selected value when the visible label hides it', () => {
    render(
      <PromptBarPicker
        id="test-picker"
        ariaLabel="Test picker"
        options={[{ value: 'alpha', label: 'Alpha' }]}
        value="alpha"
        onChange={vi.fn()}
        disabled={false}
        displayLabel="Steps"
      />,
    );

    const trigger = screen.getByRole('combobox', { name: 'Test picker' });
    const valueDescription = document.getElementById(trigger.getAttribute('aria-describedby') ?? '');

    expect(trigger.textContent).toContain('Steps');
    expect(valueDescription?.textContent).toBe('Current value: Alpha');
  });

  it('falls back below near the viewport top and constrains its width', () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, writable: true, value: 800 });
    Object.defineProperty(window, 'innerHeight', { configurable: true, writable: true, value: 600 });
    installRectMocks({
      triggerRect: rect(760, 100, 100, 30),
      listboxRect: rect(0, 0, 220, 300),
    });
    renderPicker();

    fireEvent.click(screen.getByRole('combobox', { name: 'Test picker' }));

    const listbox = screen.getByRole('listbox', { name: 'Test picker' });
    expect(listbox.style.left).toBe('572px');
    expect(listbox.style.top).toBe('136px');
    expect(listbox.style.maxHeight).toBe('456px');
    expect(listbox.style.maxWidth).toBe('784px');
    expect(listbox.style.minWidth).toBe('160px');
    expect(listbox.dataset.placement).toBe('bottom');
  });

  it('uses intrinsic content height when more space becomes available', async () => {
    let triggerRect = rect(100, 100, 120, 30);
    let listboxRect = rect(0, 0, 220, 300);
    installRectMocks({
      triggerRect: () => triggerRect,
      listboxRect: () => listboxRect,
    });
    renderPicker();

    fireEvent.click(screen.getByRole('combobox', { name: 'Test picker' }));

    const listbox = screen.getByRole('listbox', { name: 'Test picker' });
    Object.defineProperty(listbox, 'scrollHeight', { configurable: true, value: 300 });
    Object.defineProperty(listbox, 'clientHeight', { configurable: true, value: 84 });
    triggerRect = rect(100, 500, 120, 30);
    listboxRect = rect(0, 0, 220, 86); // Mirrors the previously constrained border box.
    fireEvent.scroll(window);

    await waitFor(() => expect(listbox.style.top).toBe('192px'));
    expect(parseFloat(listbox.style.top) + 302).toBeLessThan(500);
  });

  it('follows transformed ancestor movement without polling every frame', async () => {
    let triggerRect = rect(100, 500, 120, 30);
    let animationFrameCallback: FrameRequestCallback | null = null;
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      animationFrameCallback = callback;
      return 1;
    });
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {});
    installRectMocks({
      triggerRect: () => triggerRect,
      listboxRect: rect(0, 0, 220, 180),
    });
    renderPicker();

    const trigger = screen.getByRole('combobox', { name: 'Test picker' });
    fireEvent.click(trigger);
    const listbox = screen.getByRole('listbox', { name: 'Test picker' });
    act(() => animationFrameCallback?.(16));
    triggerRect = rect(240, 600, 120, 30);
    await act(async () => {
      (trigger.parentElement as HTMLElement).style.transform = 'scale(0.9)';
      await Promise.resolve();
    });
    act(() => animationFrameCallback?.(32));

    expect(listbox.style.left).toBe('240px');
    expect(listbox.style.top).toBe('414px');
  });

  it('follows a transition that was already running when the picker opened', () => {
    let triggerRect = rect(100, 500, 120, 30);
    let transitionRunning = true;
    let nextFrameId = 1;
    const frameCallbacks = new Map<number, FrameRequestCallback>();
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      const frameId = nextFrameId;
      nextFrameId += 1;
      frameCallbacks.set(frameId, callback);
      return frameId;
    });
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation((frameId) => {
      frameCallbacks.delete(frameId);
    });
    installRectMocks({
      triggerRect: () => triggerRect,
      listboxRect: rect(0, 0, 220, 180),
    });
    renderPicker();

    const trigger = screen.getByRole('combobox', { name: 'Test picker' });
    Object.defineProperty(trigger.parentElement, 'getAnimations', {
      configurable: true,
      value: () => transitionRunning
        ? [{ playState: 'running', pending: false, transitionProperty: 'transform' } as unknown as Animation]
        : [],
    });
    const runFrame = (timestamp: number) => {
      const callbacks = [...frameCallbacks.values()];
      frameCallbacks.clear();
      act(() => callbacks.forEach(callback => callback(timestamp)));
    };

    fireEvent.click(trigger); // Opens after the mocked transition has already started.
    const listbox = screen.getByRole('listbox', { name: 'Test picker' });
    expect(listbox.dataset.placement).toBe('top');

    triggerRect = rect(240, 500, 120, 30);
    runFrame(16);
    expect(listbox.style.left).toBe('240px');

    triggerRect = rect(320, 500, 120, 30);
    runFrame(32);
    expect(listbox.style.left).toBe('320px');

    transitionRunning = false;
    runFrame(48);
    expect(frameCallbacks.size).toBe(0);
  });

  it('follows anchor movement caused by body and document root mutations', async () => {
    let triggerRect = rect(100, 500, 120, 30);
    installRectMocks({
      triggerRect: () => triggerRect,
      listboxRect: rect(0, 0, 220, 180),
    });
    renderPicker();

    fireEvent.click(screen.getByRole('combobox', { name: 'Test picker' }));
    const listbox = screen.getByRole('listbox', { name: 'Test picker' });
    expect(listbox.style.left).toBe('100px');

    triggerRect = rect(220, 500, 120, 30);
    document.body.classList.add('picker-body-shift');
    await waitFor(() => expect(listbox.style.left).toBe('220px'));

    triggerRect = rect(340, 500, 120, 30);
    document.documentElement.classList.add('picker-root-shift');
    await waitFor(() => expect(listbox.style.left).toBe('340px'));
  });

  it('keeps an upward menu aligned when preceding sibling content moves its trigger', async () => {
    let triggerRect = rect(100, 500, 120, 30);
    installRectMocks({
      triggerRect: () => triggerRect,
      listboxRect: rect(0, 0, 220, 180),
    });
    const picker = (
      <PromptBarPicker
        id="test-picker"
        ariaLabel="Test picker"
        options={[{ value: 'alpha', label: 'Alpha' }]}
        value="alpha"
        onChange={vi.fn()}
        disabled={false}
      />
    );
    const { rerender } = render(
      <div>
        <span>Short label</span>
        {picker}
      </div>,
    );

    fireEvent.click(screen.getByRole('combobox', { name: 'Test picker' }));
    const listbox = screen.getByRole('listbox', { name: 'Test picker' });
    expect(listbox.dataset.placement).toBe('top');
    expect(listbox.style.left).toBe('100px');

    triggerRect = rect(260, 500, 120, 30);
    rerender(
      <div>
        <span>A much wider label that reflows the picker row</span>
        {picker}
      </div>,
    );

    await waitFor(() => expect(listbox.style.left).toBe('260px'));
    expect(listbox.dataset.placement).toBe('top'); // The alignment fix must preserve upward-first placement.
    expect(listbox.style.top).toBe('314px');
  });

  it('skips disabled options and supports keyboard dismissal', () => {
    installRectMocks({
      triggerRect: rect(100, 500, 120, 30),
      listboxRect: rect(0, 0, 220, 180),
    });
    const onChange = vi.fn();
    renderPicker(onChange);
    const trigger = screen.getByRole('combobox', { name: 'Test picker' });

    fireEvent.keyDown(trigger, { key: 'ArrowDown' });
    fireEvent.keyDown(trigger, { key: 'ArrowDown' });

    const gamma = screen.getByRole('option', { name: 'Gamma' });
    expect(trigger.getAttribute('aria-activedescendant')).toBe(gamma.id);

    fireEvent.keyDown(trigger, { key: 'Enter' });
    expect(onChange).toHaveBeenCalledWith('gamma');

    fireEvent.click(trigger);
    fireEvent.keyDown(trigger, { key: 'Escape' });
    expect(screen.queryByRole('listbox', { name: 'Test picker' })).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it.each([
    { key: 'Home', selectedValue: 'gamma', expectedOption: 'Alpha', expectedValue: 'alpha' },
    { key: 'End', selectedValue: 'alpha', expectedOption: 'Gamma', expectedValue: 'gamma' },
  ] as const)('opens upward from the closed state and highlights the boundary option with $key', ({ key, selectedValue, expectedOption, expectedValue }) => {
    installRectMocks({
      triggerRect: rect(100, 500, 120, 30),
      listboxRect: rect(0, 0, 220, 180),
    });
    const onChange = vi.fn();
    render(
      <PromptBarPicker
        id="test-picker"
        ariaLabel="Test picker"
        options={[
          { value: 'alpha', label: 'Alpha' },
          { value: 'beta', label: 'Beta', disabled: true },
          { value: 'gamma', label: 'Gamma' },
        ]}
        value={selectedValue}
        onChange={onChange}
        disabled={false}
      />,
    );
    const trigger = screen.getByRole('combobox', { name: 'Test picker' });

    fireEvent.keyDown(trigger, { key });

    const listbox = screen.getByRole('listbox', { name: 'Test picker' });
    const expected = screen.getByRole('option', { name: expectedOption });
    expect(listbox.dataset.placement).toBe('top'); // Closed-key navigation must preserve upward-first placement.
    expect(trigger.getAttribute('aria-activedescendant')).toBe(expected.id);
    expect(onChange).not.toHaveBeenCalled();

    fireEvent.keyDown(trigger, { key: 'Enter' });
    expect(onChange).toHaveBeenCalledWith(expectedValue);
  });

  it('keeps the active option stable by value when controlled options reorder', () => {
    installRectMocks({
      triggerRect: rect(100, 500, 120, 30),
      listboxRect: rect(0, 0, 220, 180),
    });
    const onChange = vi.fn();
    const renderControlledPicker = (options: ReadonlyArray<{ value: string; label: string }>) => (
      <PromptBarPicker
        id="test-picker"
        ariaLabel="Test picker"
        options={options}
        value="alpha"
        onChange={onChange}
        disabled={false}
      />
    );
    const { rerender } = render(renderControlledPicker([
      { value: 'alpha', label: 'Alpha' },
      { value: 'beta', label: 'Beta' },
      { value: 'gamma', label: 'Gamma' },
    ]));
    const trigger = screen.getByRole('combobox', { name: 'Test picker' });

    fireEvent.keyDown(trigger, { key: 'ArrowDown' });
    fireEvent.keyDown(trigger, { key: 'ArrowDown' });
    expect(trigger.getAttribute('aria-activedescendant')).toBe(screen.getByRole('option', { name: 'Beta' }).id);

    rerender(renderControlledPicker([
      { value: 'gamma', label: 'Gamma' },
      { value: 'alpha', label: 'Alpha' },
      { value: 'beta', label: 'Beta' },
    ]));

    expect(trigger.getAttribute('aria-activedescendant')).toBe(screen.getByRole('option', { name: 'Beta' }).id);
    fireEvent.keyDown(trigger, { key: 'Enter' });
    expect(onChange).toHaveBeenCalledWith('beta');
  });

  it('closes without committing when the active controlled option disappears', () => {
    installRectMocks({
      triggerRect: rect(100, 500, 120, 30),
      listboxRect: rect(0, 0, 220, 180),
    });
    const onChange = vi.fn();
    const renderControlledPicker = (options: ReadonlyArray<{ value: string; label: string }>) => (
      <PromptBarPicker
        id="test-picker"
        ariaLabel="Test picker"
        options={options}
        value="alpha"
        onChange={onChange}
        disabled={false}
      />
    );
    const { rerender } = render(renderControlledPicker([
      { value: 'alpha', label: 'Alpha' },
      { value: 'beta', label: 'Beta' },
    ]));
    const trigger = screen.getByRole('combobox', { name: 'Test picker' });

    fireEvent.keyDown(trigger, { key: 'ArrowDown' });
    fireEvent.keyDown(trigger, { key: 'ArrowDown' });
    rerender(renderControlledPicker([{ value: 'alpha', label: 'Alpha' }]));

    expect(screen.queryByRole('listbox', { name: 'Test picker' })).toBeNull();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('owns picker keys while leaving Cmd+Enter for the app generate shortcut', () => {
    installRectMocks({
      triggerRect: rect(100, 500, 120, 30),
      listboxRect: rect(0, 0, 220, 180),
    });
    const onChange = vi.fn();
    const onParentKeyDown = vi.fn();
    render(
      <div onKeyDown={onParentKeyDown}>
        <PromptBarPicker
          id="test-picker"
          ariaLabel="Test picker"
          options={[
            { value: 'alpha', label: 'Alpha' },
            { value: 'gamma', label: 'Gamma' },
          ]}
          value="alpha"
          onChange={onChange}
          disabled={false}
        />
      </div>,
    );
    const trigger = screen.getByRole('combobox', { name: 'Test picker' });

    fireEvent.keyDown(trigger, { key: 'g' });
    expect(screen.getByRole('listbox', { name: 'Test picker' })).toBeTruthy();
    expect(onParentKeyDown).not.toHaveBeenCalled();

    fireEvent.keyDown(trigger, { key: 'Escape' });
    expect(screen.queryByRole('listbox', { name: 'Test picker' })).toBeNull();
    expect(onParentKeyDown).not.toHaveBeenCalled();

    fireEvent.keyDown(trigger, { key: 'Enter', metaKey: true });
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.queryByRole('listbox', { name: 'Test picker' })).toBeNull();
    expect(onParentKeyDown).toHaveBeenCalledTimes(1);
    expect(onParentKeyDown.mock.calls[0]?.[0].defaultPrevented).toBe(true); // Generate receives the shortcut without button activation.
  });

  it('does not commit an automatic fallback when tabbing away', () => {
    installRectMocks({
      triggerRect: rect(100, 500, 120, 30),
      listboxRect: rect(0, 0, 220, 180),
    });
    const onChange = vi.fn();
    render(
      <PromptBarPicker
        id="test-picker"
        ariaLabel="Test picker"
        options={[
          { value: 'alpha', label: 'Alpha' },
          { value: 'beta', label: 'Beta', disabled: true },
          { value: 'gamma', label: 'Gamma' },
        ]}
        value="beta"
        onChange={onChange}
        disabled={false}
      />,
    );
    const trigger = screen.getByRole('combobox', { name: 'Test picker' });

    fireEvent.click(trigger);
    expect(trigger.getAttribute('aria-activedescendant')).toBe(screen.getByRole('option', { name: 'Alpha' }).id); // Confirms the fallback is visual only.
    fireEvent.keyDown(trigger, { key: 'Tab' });

    expect(onChange).not.toHaveBeenCalled();
    expect(screen.queryByRole('listbox', { name: 'Test picker' })).toBeNull();
  });

  it.each(['Enter', ' '] as const)('does not commit an automatic fallback with %s before keyboard navigation', (key) => {
    installRectMocks({
      triggerRect: rect(100, 500, 120, 30),
      listboxRect: rect(0, 0, 220, 180),
    });
    const onChange = vi.fn();
    render(
      <PromptBarPicker
        id="test-picker"
        ariaLabel="Test picker"
        options={[
          { value: 'alpha', label: 'Alpha' },
          { value: 'beta', label: 'Beta', disabled: true },
          { value: 'gamma', label: 'Gamma' },
        ]}
        value="beta"
        onChange={onChange}
        disabled={false}
      />,
    );
    const trigger = screen.getByRole('combobox', { name: 'Test picker' });

    fireEvent.click(trigger);
    fireEvent.keyDown(trigger, { key });

    expect(onChange).not.toHaveBeenCalled();
    expect(screen.queryByRole('listbox', { name: 'Test picker' })).toBeNull();
  });

  it.each([
    { key: 'ArrowDown', expectedOption: 'Gamma', expectedValue: 'gamma' },
    { key: 'ArrowUp', expectedOption: 'Alpha', expectedValue: 'alpha' },
  ] as const)('commits the $expectedOption fallback after opening with $key', ({ key, expectedOption, expectedValue }) => {
    installRectMocks({
      triggerRect: rect(100, 500, 120, 30),
      listboxRect: rect(0, 0, 220, 180),
    });
    const onChange = vi.fn();
    render(
      <PromptBarPicker
        id="test-picker"
        ariaLabel="Test picker"
        options={[
          { value: 'alpha', label: 'Alpha' },
          { value: 'beta', label: 'Beta', disabled: true },
          { value: 'gamma', label: 'Gamma' },
        ]}
        value="beta"
        onChange={onChange}
        disabled={false}
      />,
    );
    const trigger = screen.getByRole('combobox', { name: 'Test picker' });

    fireEvent.keyDown(trigger, { key });
    expect(trigger.getAttribute('aria-activedescendant')).toBe(screen.getByRole('option', { name: expectedOption }).id);
    fireEvent.keyDown(trigger, { key: 'Enter' });

    expect(onChange).toHaveBeenCalledWith(expectedValue);
    expect(screen.queryByRole('listbox', { name: 'Test picker' })).toBeNull();
  });

  it.each(['Enter', ' '] as const)('commits a pointer-activated option with %s', (key) => {
    installRectMocks({
      triggerRect: rect(100, 500, 120, 30),
      listboxRect: rect(0, 0, 220, 180),
    });
    const onChange = vi.fn();
    renderPicker(onChange);
    const trigger = screen.getByRole('combobox', { name: 'Test picker' });

    fireEvent.click(trigger);
    const gamma = screen.getByRole('option', { name: 'Gamma' });
    fireEvent.mouseEnter(gamma);
    expect(trigger.getAttribute('aria-activedescendant')).toBe(gamma.id);
    fireEvent.keyDown(trigger, { key });

    expect(onChange).toHaveBeenCalledWith('gamma');
    expect(screen.queryByRole('listbox', { name: 'Test picker' })).toBeNull();
  });

  it('does not let earlier keyboard navigation make Tab commit a hovered option', () => {
    installRectMocks({
      triggerRect: rect(100, 500, 120, 30),
      listboxRect: rect(0, 0, 220, 180),
    });
    const onChange = vi.fn();
    render(
      <PromptBarPicker
        id="test-picker"
        ariaLabel="Test picker"
        options={[
          { value: 'alpha', label: 'Alpha' },
          { value: 'gamma', label: 'Gamma' },
          { value: 'delta', label: 'Delta' },
        ]}
        value="alpha"
        onChange={onChange}
        disabled={false}
      />,
    );
    const trigger = screen.getByRole('combobox', { name: 'Test picker' });

    fireEvent.keyDown(trigger, { key: 'ArrowDown' });
    fireEvent.keyDown(trigger, { key: 'ArrowDown' });
    const delta = screen.getByRole('option', { name: 'Delta' });
    fireEvent.mouseEnter(delta);
    fireEvent.keyDown(trigger, { key: 'Tab' });

    expect(onChange).not.toHaveBeenCalled();
    expect(screen.queryByRole('listbox', { name: 'Test picker' })).toBeNull();
  });

  it('supports buffered typeahead and repeated-character cycling', () => {
    installRectMocks({
      triggerRect: rect(100, 500, 120, 30),
      listboxRect: rect(0, 0, 220, 240),
    });
    const onChange = vi.fn();
    render(
      <PromptBarPicker
        id="test-picker"
        ariaLabel="Test picker"
        options={[
          { value: 'alpha', label: 'Alpha' },
          { value: 'gadget', label: 'Gadget', disabled: true },
          { value: 'gamma', label: 'Gamma' },
          { value: 'garden', label: 'Garden' },
        ]}
        value="alpha"
        onChange={onChange}
        disabled={false}
      />,
    );
    const trigger = screen.getByRole('combobox', { name: 'Test picker' });

    fireEvent.keyDown(trigger, { key: 'g' });
    fireEvent.keyDown(trigger, { key: 'a' });
    expect(trigger.getAttribute('aria-activedescendant')).toBe(screen.getByRole('option', { name: 'Gamma' }).id);

    fireEvent.keyDown(trigger, { key: 'Escape' });
    fireEvent.keyDown(trigger, { key: 'g' });
    fireEvent.keyDown(trigger, { key: 'g' });
    expect(trigger.getAttribute('aria-activedescendant')).toBe(screen.getByRole('option', { name: 'Garden' }).id);

    fireEvent.keyDown(trigger, { key: 'Tab' });
    expect(onChange).toHaveBeenCalledWith('garden');
    expect(screen.queryByRole('listbox', { name: 'Test picker' })).toBeNull();
  });

  it('clears typeahead before arrow navigation so Space commits the active option', () => {
    installRectMocks({
      triggerRect: rect(100, 500, 120, 30),
      listboxRect: rect(0, 0, 220, 240),
    });
    const onChange = vi.fn();
    render(
      <PromptBarPicker
        id="test-picker"
        ariaLabel="Test picker"
        options={[
          { value: 'alpha', label: 'Alpha' },
          { value: 'gamma', label: 'Gamma' },
          { value: 'garden', label: 'Garden' },
        ]}
        value="alpha"
        onChange={onChange}
        disabled={false}
      />,
    );
    const trigger = screen.getByRole('combobox', { name: 'Test picker' });

    fireEvent.keyDown(trigger, { key: 'g' });
    fireEvent.keyDown(trigger, { key: 'ArrowDown' });
    expect(trigger.getAttribute('aria-activedescendant')).toBe(screen.getByRole('option', { name: 'Garden' }).id);

    fireEvent.keyDown(trigger, { key: ' ' });
    expect(onChange).toHaveBeenCalledWith('garden');
    expect(screen.queryByRole('listbox', { name: 'Test picker' })).toBeNull();
  });

  it('commits a single-word typeahead match with the first Space press', () => {
    installRectMocks({
      triggerRect: rect(100, 500, 120, 30),
      listboxRect: rect(0, 0, 220, 240),
    });
    const onChange = vi.fn();
    renderPicker(onChange);
    const trigger = screen.getByRole('combobox', { name: 'Test picker' });

    fireEvent.keyDown(trigger, { key: 'g' });
    expect(trigger.getAttribute('aria-activedescendant')).toBe(screen.getByRole('option', { name: 'Gamma' }).id);
    fireEvent.keyDown(trigger, { key: ' ' });

    expect(onChange).toHaveBeenCalledWith('gamma');
    expect(screen.queryByRole('listbox', { name: 'Test picker' })).toBeNull();
  });

  it('commits a repeated-character typeahead match with the first Space press', () => {
    installRectMocks({
      triggerRect: rect(100, 500, 120, 30),
      listboxRect: rect(0, 0, 220, 240),
    });
    const onChange = vi.fn();
    render(
      <PromptBarPicker
        id="test-picker"
        ariaLabel="Test picker"
        options={[
          { value: 'alpha', label: 'Alpha' },
          { value: 'gamma', label: 'Gamma' },
          { value: 'garden', label: 'Garden' },
        ]}
        value="alpha"
        onChange={onChange}
        disabled={false}
      />,
    );
    const trigger = screen.getByRole('combobox', { name: 'Test picker' });

    fireEvent.keyDown(trigger, { key: 'g' });
    fireEvent.keyDown(trigger, { key: 'g' });
    expect(trigger.getAttribute('aria-activedescendant')).toBe(screen.getByRole('option', { name: 'Garden' }).id);
    fireEvent.keyDown(trigger, { key: ' ' });

    expect(onChange).toHaveBeenCalledWith('garden');
    expect(screen.queryByRole('listbox', { name: 'Test picker' })).toBeNull();
  });

  it('lets Space commit keyboard navigation after unmatched typeahead', () => {
    installRectMocks({
      triggerRect: rect(100, 500, 120, 30),
      listboxRect: rect(0, 0, 220, 240),
    });
    const onChange = vi.fn();
    renderPicker(onChange);
    const trigger = screen.getByRole('combobox', { name: 'Test picker' });

    fireEvent.keyDown(trigger, { key: 'ArrowDown' });
    fireEvent.keyDown(trigger, { key: 'ArrowDown' });
    expect(trigger.getAttribute('aria-activedescendant')).toBe(screen.getByRole('option', { name: 'Gamma' }).id);
    fireEvent.keyDown(trigger, { key: 'z' }); // Leaves the keyboard highlight unchanged because no option matches.
    fireEvent.keyDown(trigger, { key: ' ' });

    expect(onChange).toHaveBeenCalledWith('gamma');
    expect(screen.queryByRole('listbox', { name: 'Test picker' })).toBeNull();
  });

  it('uses spaces to disambiguate multi-word options during buffered typeahead', () => {
    installRectMocks({
      triggerRect: rect(100, 500, 120, 30),
      listboxRect: rect(0, 0, 220, 240),
    });
    const onChange = vi.fn();
    render(
      <PromptBarPicker
        id="test-picker"
        ariaLabel="Test picker"
        options={[
          { value: 've', label: 'Seedance 2++ (VE)' },
          { value: 'fal', label: 'Seedance 2 (FAL)' },
          { value: 'jimeng', label: 'Seedance 2 (JM CLI)' },
        ]}
        value="ve"
        onChange={onChange}
        disabled={false}
      />,
    );
    const trigger = screen.getByRole('combobox', { name: 'Test picker' });

    Array.from('seedance 2 (j').forEach(key => fireEvent.keyDown(trigger, { key }));

    expect(onChange).not.toHaveBeenCalled();
    expect(trigger.getAttribute('aria-activedescendant')).toBe(screen.getByRole('option', { name: 'Seedance 2 (JM CLI)' }).id);
    fireEvent.keyDown(trigger, { key: 'Tab' });
    expect(onChange).toHaveBeenCalledWith('jimeng');
  });
});
