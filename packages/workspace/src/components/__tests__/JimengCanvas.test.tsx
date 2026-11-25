import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { JimengCanvasApproval } from '../JimengCanvasApproval';
import { JimengCanvasSetup } from '../JimengCanvasSetup';
import { checkJimengCanvasLogin, getJimengCanvasSetupStatus, installJimengCanvasCli, startJimengCanvasLogin, type JimengCanvasApprovalJob, type JimengCanvasSetupAction } from '../../services/jimengCanvasService';

vi.mock('../../services/jimengCanvasService', () => ({
  getJimengCanvasSetupStatus: vi.fn(),
  installJimengCanvasCli: vi.fn(),
  startJimengCanvasLogin: vi.fn(),
  checkJimengCanvasLogin: vi.fn(),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('Jimeng Canvas credit approval', () => {
  const job: JimengCanvasApprovalJob = { id: 'job-1', phase: 'awaiting_approval', mediaType: 'image', quote: { revision: 'r1', credits: 2.75 }, assets: [] };

  it('requires a deliberate action and approves exactly the displayed revision once', () => {
    const onApprove = vi.fn();
    const onCancel = vi.fn();
    render(<JimengCanvasApproval job={job} onApprove={onApprove} onCancel={onCancel} />);
    expect(onApprove).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Approve 2.75 credits' }));
    fireEvent.click(screen.getByRole('button', { name: 'Approve 2.75 credits' }));
    expect(onApprove).toHaveBeenCalledExactlyOnceWith('r1');
    expect(onCancel).not.toHaveBeenCalled();
  });

  it('lets the user cancel a refreshed quote without approving it', () => {
    const onApprove = vi.fn();
    const onCancel = vi.fn();
    const view = render(<JimengCanvasApproval job={job} onApprove={onApprove} onCancel={onCancel} />);
    view.rerender(<JimengCanvasApproval job={{ ...job, quote: { revision: 'r2', credits: 4 } }} onApprove={onApprove} onCancel={onCancel} />);
    expect(screen.getByRole('button', { name: 'Approve 4 credits' })).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onApprove).not.toHaveBeenCalled();
  });
});

describe('Jimeng Canvas setup', () => {
  beforeEach(() => {
    vi.mocked(getJimengCanvasSetupStatus).mockResolvedValue({ cliAvailable: true, authenticated: false, version: '1.4.1' });
  });

  it('only checks status on opening', async () => {
    render(<JimengCanvasSetup onDismiss={vi.fn()} />);
    await screen.findByText('Installed · 1.4.1');
    expect(installJimengCanvasCli).not.toHaveBeenCalled();
    expect(startJimengCanvasLogin).not.toHaveBeenCalled();
  });

  it('shows an authorization link and polls until the account is ready', async () => {
    const onReadyChange = vi.fn();
    let authorize: (result: JimengCanvasSetupAction) => void = () => undefined;
    vi.mocked(startJimengCanvasLogin).mockResolvedValue({ loginSessionId: 'login-1', userCode: 'ABC-123', verificationUri: 'https://example.com/authorize' });
    vi.mocked(checkJimengCanvasLogin).mockReturnValue(new Promise(resolve => { authorize = resolve; }));
    render(<JimengCanvasSetup onDismiss={vi.fn()} onReadyChange={onReadyChange} />);
    await screen.findByText('Installed · 1.4.1');
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    const link = await screen.findByRole('link', { name: 'Open authorization page' });
    expect(link.getAttribute('href')).toBe('https://example.com/authorize');
    expect(screen.getByText('ABC-123')).toBeDefined();
    vi.mocked(getJimengCanvasSetupStatus).mockResolvedValue({ cliAvailable: true, authenticated: true, version: '1.4.1' });
    await act(async () => authorize({ authenticated: true }));
    await waitFor(() => expect(onReadyChange).toHaveBeenLastCalledWith(true));
    expect(screen.queryByRole('link', { name: 'Open authorization page' })).toBeNull();
  });

  it('aborts its setup request when dismissed by the parent', async () => {
    vi.mocked(getJimengCanvasSetupStatus).mockImplementation(() => new Promise(() => undefined));
    const view = render(<JimengCanvasSetup onDismiss={vi.fn()} />);
    const signal = vi.mocked(getJimengCanvasSetupStatus).mock.calls[0][0]?.signal;
    view.unmount();
    expect(signal?.aborted).toBe(true);
  });
});
