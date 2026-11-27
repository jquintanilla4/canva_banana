import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { JimengCanvasApproval } from '../JimengCanvasApproval';
import { JimengCanvasSetup } from '../JimengCanvasSetup';
import { checkJimengCanvasLogin, getJimengCanvasSetupStatus, installJimengCanvasCli, removeJimengLegacyCli, startJimengCanvasLogin, type JimengCanvasApprovalJob, type JimengCanvasSetupAction, type JimengCanvasSetupStatus } from '../../services/jimengCanvasService';

vi.mock('../../services/jimengCanvasService', () => ({
  getJimengCanvasSetupStatus: vi.fn(),
  installJimengCanvasCli: vi.fn(),
  removeJimengLegacyCli: vi.fn(),
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
  const ready: JimengCanvasSetupStatus = { cliAvailable: true, authenticated: true, version: '1.4.1', legacyCliInstallations: [] };
  const legacyHomePath = '/user/.local/bin/dreamina';
  const legacyAppPath = '/app-data/.tools/jimeng/bin/dreamina';
  const legacyCliInstallations: JimengCanvasSetupStatus['legacyCliInstallations'] = [
    { location: 'home', path: legacyHomePath },
    { location: 'app', path: legacyAppPath },
  ];

  beforeEach(() => {
    vi.mocked(getJimengCanvasSetupStatus).mockResolvedValue({ ...ready, authenticated: false });
  });

  it('only checks status on opening', async () => {
    render(<JimengCanvasSetup onDismiss={vi.fn()} />);
    await screen.findByText('Installed · 1.4.1');
    expect(installJimengCanvasCli).not.toHaveBeenCalled();
    expect(startJimengCanvasLogin).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: 'Remove legacy CLI' })).toBeNull();
  });

  it('confirms the selected removal without rechecking Canvas and leaves installation available', async () => {
    const onReadyChange = vi.fn();
    const notInstalled = { cliAvailable: false, authenticated: false };
    vi.mocked(getJimengCanvasSetupStatus).mockResolvedValue({ ...notInstalled, legacyCliInstallations });
    render(<JimengCanvasSetup onDismiss={vi.fn()} onReadyChange={onReadyChange} />);
    await screen.findByText(legacyHomePath);
    const [home, app] = screen.getAllByRole('listitem');
    expect(within(home).getByText(legacyHomePath)).toBeDefined();
    expect(within(app).getByText(legacyAppPath)).toBeDefined();
    fireEvent.click(within(home).getByRole('button', { name: 'Remove legacy CLI' }));
    expect(removeJimengLegacyCli).not.toHaveBeenCalled();
    fireEvent.click(within(home).getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('button', { name: 'Confirm removal' })).toBeNull();
    vi.mocked(getJimengCanvasSetupStatus).mockRejectedValue(new Error('Status unavailable.'));
    vi.mocked(removeJimengLegacyCli).mockResolvedValue({ message: 'Legacy Dreamina CLI removed.' });
    fireEvent.click(within(home).getByRole('button', { name: 'Remove legacy CLI' }));
    fireEvent.click(within(home).getByRole('button', { name: 'Confirm removal' }));
    await waitFor(() => expect(screen.queryByText(legacyHomePath)).toBeNull());
    expect(removeJimengLegacyCli).toHaveBeenCalledExactlyOnceWith({ location: 'home', signal: expect.any(AbortSignal) });
    expect(screen.getByText(legacyAppPath)).toBeDefined();
    expect(screen.getByRole('status').textContent).toBe('Legacy Dreamina CLI removed.');
    expect(getJimengCanvasSetupStatus).toHaveBeenCalledTimes(1);
    expect(onReadyChange).toHaveBeenCalledExactlyOnceWith(false);
    expect(installJimengCanvasCli).not.toHaveBeenCalled();
    vi.mocked(getJimengCanvasSetupStatus).mockResolvedValue({ ...ready, legacyCliInstallations: [legacyCliInstallations[1]] });
    vi.mocked(installJimengCanvasCli).mockResolvedValue({});
    fireEvent.click(screen.getByRole('button', { name: 'Install / update' }));
    await screen.findByText('Installed · 1.4.1');
    expect(installJimengCanvasCli).toHaveBeenCalledTimes(1);
  });

  it('reports a removal failure without changing the Canvas account state', async () => {
    const onReadyChange = vi.fn();
    vi.mocked(getJimengCanvasSetupStatus).mockResolvedValue({ ...ready, legacyCliInstallations: [legacyCliInstallations[0]] });
    vi.mocked(removeJimengLegacyCli).mockRejectedValue(new Error('Check file permissions.'));
    render(<JimengCanvasSetup onDismiss={vi.fn()} onReadyChange={onReadyChange} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Remove legacy CLI' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm removal' }));
    expect((await screen.findByRole('alert')).textContent).toBe('Check file permissions.');
    expect(screen.getByText('Signed in')).toBeDefined();
    expect(screen.getByRole('button', { name: 'Remove legacy CLI' })).toBeDefined();
    expect(onReadyChange).toHaveBeenCalledExactlyOnceWith(true);
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
    vi.mocked(getJimengCanvasSetupStatus).mockResolvedValue(ready);
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
