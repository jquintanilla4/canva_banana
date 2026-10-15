import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FalQueuePanel } from '../FalQueuePanel';
import type { FalQueueJob } from '../../types';

const buildJob = (overrides: Partial<FalQueueJob> = {}): FalQueueJob => ({
  id: 'job-1',
  prompt: 'Generate a test image',
  modelId: 'fal-ai/test-model',
  modelLabel: 'Test Model',
  provider: 'fal',
  status: 'IN_QUEUE',
  phase: 'uploading',
  phaseMessage: 'Uploading source image...',
  logs: [],
  createdAt: 1,
  updatedAt: 1,
  ...overrides,
});

describe('FalQueuePanel', () => {
  afterEach(() => {
    cleanup();
  });

  it('renders the active phase label and phase message', () => {
    render(
      <FalQueuePanel
        jobs={[buildJob()]}
        onDismiss={vi.fn()}
        onRetry={vi.fn()}
        blindTestEnabled={false}
        openSourceAliasEnabled={false}
        blindTestMapping={new Map()}
      />,
    );

    expect(screen.getByText('Uploading')).not.toBeNull();
    expect(screen.getByText('Uploading source image...')).not.toBeNull();
  });

  it('retries retryable failed jobs and dismisses terminal jobs', () => {
    const onDismiss = vi.fn();
    const onRetry = vi.fn(() => true);

    render(
      <FalQueuePanel
        jobs={[buildJob({
          status: 'FAILED',
          phase: 'failed',
          error: 'Generation failed',
          retryInputs: {
            kind: 'text_to_image',
            prompt: 'Generate a test image',
            provider: 'fal',
            modelId: 'fal-ai/test-model',
            modelMode: 'image',
          },
        })]}
        onDismiss={onDismiss}
        onRetry={onRetry}
        blindTestEnabled={false}
        openSourceAliasEnabled={false}
        blindTestMapping={new Map()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));

    expect(onRetry).toHaveBeenCalledWith('job-1');
    expect(onDismiss).toHaveBeenCalledWith('job-1');
  });

  it('locks a failed job retry while the retry attempt is pending', () => {
    const onRetry = vi.fn(() => new Promise<boolean>(() => {}));

    render(
      <FalQueuePanel
        jobs={[buildJob({
          status: 'FAILED',
          phase: 'failed',
          retryInputs: {
            kind: 'text_to_image',
            prompt: 'Generate a test image',
            provider: 'fal',
            modelId: 'fal-ai/test-model',
            modelMode: 'image',
          },
        })]}
        onDismiss={vi.fn()}
        onRetry={onRetry}
        blindTestEnabled={false}
        openSourceAliasEnabled={false}
        blindTestMapping={new Map()}
      />,
    );

    const retryButton = screen.getByRole('button', { name: 'Retry' });
    fireEvent.click(retryButton);
    fireEvent.click(retryButton);

    expect((retryButton as HTMLButtonElement).disabled).toBe(true);
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('unlocks retry when a started retry resolves without changing the failed job', async () => {
    let resolveRetry: (retryStarted: boolean) => void = () => {};
    const retryPromise = new Promise<boolean>(resolve => {
      resolveRetry = resolve;
    });
    const onRetry = vi.fn(() => retryPromise);

    render(
      <FalQueuePanel
        jobs={[buildJob({
          status: 'FAILED',
          phase: 'failed',
          updatedAt: 10,
          retryInputs: {
            kind: 'text_to_image',
            prompt: 'Generate a test image',
            provider: 'fal',
            modelId: 'fal-ai/test-model',
            modelMode: 'image',
          },
        })]}
        onDismiss={vi.fn()}
        onRetry={onRetry}
        blindTestEnabled={false}
        openSourceAliasEnabled={false}
        blindTestMapping={new Map()}
      />,
    );

    const retryButton = screen.getByRole('button', { name: 'Retry' });
    fireEvent.click(retryButton);

    expect((retryButton as HTMLButtonElement).disabled).toBe(true);

    await act(async () => {
      resolveRetry(true);
      await retryPromise;
    });

    await waitFor(() => expect((retryButton as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(retryButton);

    expect(onRetry).toHaveBeenCalledTimes(2);
  });

  it('unlocks retry when the parent does not start a retry', async () => {
    const onRetry = vi.fn(() => false);

    render(
      <FalQueuePanel
        jobs={[buildJob({
          status: 'FAILED',
          phase: 'failed',
          retryInputs: {
            kind: 'text_to_image',
            prompt: 'Generate a test image',
            provider: 'fal',
            modelId: 'fal-ai/test-model',
            modelMode: 'image',
          },
        })]}
        onDismiss={vi.fn()}
        onRetry={onRetry}
        blindTestEnabled={false}
        openSourceAliasEnabled={false}
        blindTestMapping={new Map()}
      />,
    );

    const retryButton = screen.getByRole('button', { name: 'Retry' });
    fireEvent.click(retryButton);

    await waitFor(() => expect((retryButton as HTMLButtonElement).disabled).toBe(false));
    expect(onRetry).toHaveBeenCalledWith('job-1');
  });

  it('reopens a collapsed queue when a new active job starts', () => {
    const { rerender } = render(
      <FalQueuePanel
        jobs={[buildJob({
          modelLabel: 'Terminal Model',
          status: 'FAILED',
          phase: 'failed',
          phaseMessage: 'Generation failed',
        })]}
        onDismiss={vi.fn()}
        onRetry={vi.fn()}
        blindTestEnabled={false}
        openSourceAliasEnabled={false}
        blindTestMapping={new Map()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Collapse queue notifications' }));

    expect(screen.getByText('Queue Notifications')).not.toBeNull();
    expect(screen.queryByText('Terminal Model')).toBeNull();

    rerender(
      <FalQueuePanel
        jobs={[buildJob({ id: 'job-2', modelLabel: 'Active Model', createdAt: 2, updatedAt: 2 })]}
        onDismiss={vi.fn()}
        onRetry={vi.fn()}
        blindTestEnabled={false}
        openSourceAliasEnabled={false}
        blindTestMapping={new Map()}
      />,
    );

    expect(screen.getByText('Active Model')).not.toBeNull();
    expect(screen.queryByRole('button', { name: 'Expand queue notifications' })).toBeNull();
  });
});
