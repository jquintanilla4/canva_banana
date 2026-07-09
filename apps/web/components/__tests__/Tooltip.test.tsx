import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Tooltip } from '../Tooltip';

const defaultViewport = {
  height: window.innerHeight,
  width: window.innerWidth,
};

const rect = (left: number, top: number, width: number, height: number): DOMRect => ({
  bottom: top + height,
  height,
  left,
  right: left + width,
  toJSON: () => ({}),
  top,
  width,
  x: left,
  y: top,
});

const setViewport = (width: number, height: number) => {
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: width });
  Object.defineProperty(window, 'innerHeight', { configurable: true, value: height });
};

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  setViewport(defaultViewport.width, defaultViewport.height);
});

describe('Tooltip', () => {
  it('appears on hover with label and shortcut text', () => {
    render(
      <Tooltip label="Select" shortcut="V">
        <button type="button">Target</button>
      </Tooltip>
    );

    expect(screen.queryByRole('tooltip')).toBeNull();

    fireEvent.mouseEnter(screen.getByRole('button', { name: 'Target' }).parentElement as HTMLElement);

    expect(screen.getByRole('tooltip').textContent).toContain('Select');
    expect(screen.getByRole('tooltip').textContent).toContain('V');
  });

  it('appears on focus and wires the tooltip id to the target', () => {
    render(
      <Tooltip label="Generate" shortcut="Cmd+Enter">
        <button type="button">Generate</button>
      </Tooltip>
    );

    const button = screen.getByRole('button', { name: 'Generate' });

    fireEvent.focus(button);

    const tooltip = screen.getByRole('tooltip');
    expect(button.getAttribute('aria-describedby')).toContain(tooltip.id);
    expect(tooltip.textContent).toContain('Cmd+Enter');
  });

  it('hides after hover leaves', () => {
    render(
      <Tooltip label="Pan">
        <button type="button">Target</button>
      </Tooltip>
    );

    const wrapper = screen.getByRole('button', { name: 'Target' }).parentElement as HTMLElement;
    fireEvent.mouseEnter(wrapper);
    fireEvent.mouseLeave(wrapper);

    expect(screen.queryByRole('tooltip')).toBeNull();
  });

  it('flips below the target when the top edge is too close', () => {
    setViewport(300, 200);
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function () {
      const element = this as HTMLElement;
      if (element.getAttribute('role') === 'tooltip') {
        return rect(0, 0, 120, 32);
      }
      if (element.className === 'relative inline-flex') {
        return rect(80, 4, 40, 32);
      }
      return rect(0, 0, 0, 0);
    });
    render(
      <Tooltip label="Pan">
        <button type="button">Target</button>
      </Tooltip>
    );

    fireEvent.mouseEnter(screen.getByRole('button', { name: 'Target' }).parentElement as HTMLElement);

    expect(screen.getByRole('tooltip').style.top).toBe('44px');
  });

  it('clamps wide tooltips inside the right window edge', () => {
    setViewport(220, 200);
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function () {
      const element = this as HTMLElement;
      if (element.getAttribute('role') === 'tooltip') {
        return rect(0, 0, 160, 32);
      }
      if (element.className === 'relative inline-flex') {
        return rect(200, 80, 16, 32);
      }
      return rect(0, 0, 0, 0);
    });
    render(
      <Tooltip label="Show Generation Prompt Metadata">
        <button type="button">Metadata</button>
      </Tooltip>
    );

    fireEvent.mouseEnter(screen.getByRole('button', { name: 'Metadata' }).parentElement as HTMLElement);

    expect(screen.getByRole('tooltip').style.left).toBe('52px');
  });
});
