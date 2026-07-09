import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
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
  it('renders the active phase label and phase message', () => {
    render(
      <FalQueuePanel
        jobs={[buildJob()]}
        onDismiss={vi.fn()}
        blindTestEnabled={false}
        openSourceAliasEnabled={false}
        blindTestMapping={new Map()}
      />,
    );

    expect(screen.getByText('Uploading')).not.toBeNull();
    expect(screen.getByText('Uploading source image...')).not.toBeNull();
  });
});
