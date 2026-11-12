import React from 'react';
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PromptBar } from '../PromptBar';
import * as runtimeConfig from '../../services/runtimeConfig';

const rect = (left: number, top: number, width: number, height: number) => new DOMRect(left, top, width, height);

const Workspace = (props: Partial<React.ComponentProps<typeof PromptBar>>) => (
  <div className="canva-banana-workspace" data-testid="workspace">
    <div data-testid="provider-switcher-root" />
    <div data-testid="view-toolbar-root" />
    <PromptBar
      prompt="Animate the subject"
      onPromptChange={vi.fn()}
      onSubmit={vi.fn()}
      isLoading={false}
      inputDisabled={false}
      submitDisabled={false}
      modelOptions={[{ value: 'wide-model', label: 'Wide model' }]}
      selectedModel="wide-model"
      onModelChange={vi.fn()}
      modelSelectDisabled={false}
      modelMode="image"
      onModelModeChange={vi.fn()}
      {...props}
    />
  </div>
);

const renderWorkspace = (props: Partial<React.ComponentProps<typeof PromptBar>> = {}) => render(<Workspace {...props} />);

const installGeometry = (scale = 1) => {
  const geometry = {
    footer: rect(10, 600, 1000, 150),
    left: rect(20, 710, 70, 30),
    right: rect(900, 700, 100, 40),
    hostWidth: 1024,
  };
  vi.spyOn(runtimeConfig, 'getWorkspaceSize').mockImplementation(() => ({ width: geometry.hostWidth, height: 768 }));
  vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockImplementation(function () {
    return this.dataset.testid === 'prompt-bar-footer' ? geometry.footer.width / scale : 0;
  });
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function () {
    if (this.hasAttribute('data-outside')) return rect(250, 700, 100, 40);
    switch (this.dataset.testid) {
      case 'prompt-bar-footer':
        return rect(geometry.footer.left, geometry.footer.top - (parseFloat(this.style.bottom) || 0) * scale, geometry.footer.width, geometry.footer.height);
      case 'provider-switcher-root': return geometry.left;
      case 'view-toolbar-root': return geometry.right;
      default: return rect(0, 0, 0, 0);
    }
  });
  const getComputedStyle = window.getComputedStyle.bind(window);
  vi.spyOn(window, 'getComputedStyle').mockImplementation((element, pseudoElement) => {
    const style = getComputedStyle(element, pseudoElement);
    if (element.getAttribute('data-testid') === 'prompt-bar-footer') {
      Object.defineProperty(style, 'paddingBottom', { value: '9.76px' });
    }
    return style;
  });
  const observers: { notify: (target: Element) => void; targets: Element[]; active: boolean }[] = [];
  vi.stubGlobal('ResizeObserver', class {
    observer: typeof observers[number];
    constructor(callback: ResizeObserverCallback) {
      this.observer = {
        notify: target => callback([{ target, contentRect: rect(0, 0, 0, 0), borderBoxSize: [], contentBoxSize: [], devicePixelContentBoxSize: [] }], this),
        targets: [],
        active: true,
      };
      observers.push(this.observer);
    }
    observe(target: Element) { this.observer.targets.push(target); }
    disconnect() { this.observer.active = false; }
    unobserve() {}
  });
  const resize = (target: Element) => act(() => {
    for (const observer of [...observers]) {
      if (observer.active && observer.targets.includes(target)) {
        observer.notify(target);
      }
    }
  });
  return { geometry, resize, observers };
};

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('PromptBar footer collision', () => {
  it.each(['left', 'right', 'both'] as const)('clears %s controls at the unshifted baseline and stays stable', (side) => {
    const { geometry, resize } = installGeometry();
    if (side === 'left') geometry.right = rect(1200, 700, 100, 40);
    if (side === 'right') geometry.left = rect(-100, 710, 70, 30);
    renderWorkspace();
    const footer = screen.getByTestId('prompt-bar-footer');
    const expectedLift = side === 'left' ? 49.76 : 59.76;
    expect(parseFloat(footer.style.bottom)).toBeCloseTo(expectedLift);
    resize(footer);
    resize(footer);
    expect(parseFloat(footer.style.bottom)).toBeCloseTo(expectedLift);
    expect(footer.getBoundingClientRect().bottom).toBeLessThanOrEqual(side === 'left' ? 710 : 700);
  });

  it.each([
    { name: 'horizontal clearance', left: rect(-100, 710, 70, 30), right: rect(1200, 700, 100, 40) },
    { name: 'vertical clearance', left: rect(20, 500, 70, 30), right: rect(900, 500, 100, 40) },
    { name: 'zero-area controls', left: rect(20, 710, 0, 30), right: rect(900, 700, 100, 0) },
  ])('keeps the original baseline with $name', ({ left, right }) => {
    const { geometry } = installGeometry();
    geometry.left = left;
    geometry.right = right;
    renderWorkspace();
    expect(screen.getByTestId('prompt-bar-footer').style.bottom).toBe('0px');
  });

  it('ignores hidden controls that retain a layout box', () => {
    const { resize } = installGeometry();
    renderWorkspace();
    screen.getByTestId('provider-switcher-root').style.visibility = 'hidden';
    screen.getByTestId('view-toolbar-root').style.visibility = 'hidden';
    const footer = screen.getByTestId('prompt-bar-footer');
    resize(footer);
    expect(footer.style.bottom).toBe('0px');
  });

  it('restores the baseline when a resized footer fits and lifts again when it grows', () => {
    const { geometry, resize } = installGeometry();
    renderWorkspace();
    const footer = screen.getByTestId('prompt-bar-footer');
    geometry.footer = rect(200, 600, 500, 150);
    resize(footer);
    expect(footer.style.bottom).toBe('0px');
    geometry.footer = rect(10, 600, 1000, 150);
    resize(footer);
    expect(parseFloat(footer.style.bottom)).toBeCloseTo(59.76);
  });

  it('rechecks model and full/mini commits without resizing the window', () => {
    const { geometry } = installGeometry();
    const { rerender } = renderWorkspace();
    const footer = screen.getByTestId('prompt-bar-footer');
    geometry.footer = rect(200, 700, 500, 50);
    rerender(<Workspace sizeMode="mini" />);
    expect(footer.style.bottom).toBe('0px');
    geometry.footer = rect(10, 600, 1000, 150);
    rerender(<Workspace sizeMode="full" selectedModel="another-wide-model" />);
    expect(parseFloat(footer.style.bottom)).toBeCloseTo(59.76);
  });

  it('converts viewport clearance to local positioning pixels at non-default scale', () => {
    const { geometry, resize } = installGeometry(0.8);
    renderWorkspace();
    const footer = screen.getByTestId('prompt-bar-footer');
    expect(parseFloat(footer.style.bottom)).toBeCloseTo(72.26);
    expect(footer.getBoundingClientRect().bottom).toBeCloseTo(geometry.right.top - 9.76 * 0.8);
    resize(footer);
    expect(parseFloat(footer.style.bottom)).toBeCloseTo(72.26);
  });

  it('refreshes the width clamp and placement when only the workspace host resizes', () => {
    const { geometry, resize } = installGeometry();
    renderWorkspace();
    const footer = screen.getByTestId('prompt-bar-footer');
    expect(parseFloat(footer.style.maxWidth)).toBe(1000);
    geometry.hostWidth = 700;
    geometry.footer = rect(180, 600, 650, 150);
    resize(screen.getByTestId('workspace'));
    expect(parseFloat(footer.style.maxWidth)).toBe(676);
    expect(footer.style.bottom).toBe('0px');
  });

  it('ignores controls in another workspace', () => {
    const { geometry } = installGeometry();
    geometry.footer = rect(200, 600, 500, 150);
    render(<div className="canva-banana-workspace"><div data-testid="view-toolbar-root" data-outside /></div>);
    renderWorkspace();
    expect(screen.getByTestId('prompt-bar-footer').style.bottom).toBe('0px');
  });

  it('does not install footer observers or positioning for inline prompt bars', () => {
    const { observers } = installGeometry();
    renderWorkspace({ layout: 'inline' });
    expect(screen.getByTestId('prompt-bar-inline').style.bottom).toBe('');
    expect(observers).toHaveLength(0);
  });

  it('disconnects retired observers and ignores their queued resize callbacks', () => {
    const { geometry, observers } = installGeometry();
    const { unmount } = renderWorkspace();
    const retiredObservers = [...observers];
    const footer = screen.getByTestId('prompt-bar-footer');
    const previousBottom = footer.style.bottom;
    unmount();
    geometry.footer = rect(200, 600, 500, 150);
    act(() => retiredObservers.forEach(observer => observer.notify(footer)));
    expect(observers.every(observer => !observer.active)).toBe(true);
    expect(footer.style.bottom).toBe(previousBottom);
  });

});
