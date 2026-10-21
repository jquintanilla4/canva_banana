import React, { useState } from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PromptChatPanel } from '../PromptChatPanel';

const sendOpenRouterChat = vi.hoisted(() => vi.fn());

vi.mock('../../services/openRouterChatService', () => ({
  OPENROUTER_CHAT_MODELS: [
    { id: 'google/gemini-3.5-flash', label: 'Gemini 3.5 Flash' },
    { id: 'anthropic/claude-sonnet-4.6', label: 'Claude Sonnet 4.6' },
    { id: 'openai/gpt-5.5', label: 'GPT 5.5' },
  ],
  OPENROUTER_MAX_CHAT_MESSAGES: 40, // Mirrors backend transcript limit.
  OPENROUTER_MAX_MESSAGE_CHARS: 12000, // Mirrors backend message limit.
  sendOpenRouterChat,
}));

const renderHarness = (currentPrompt = 'A cinematic product shot', isSuppressed = false, initialOpen = false) => {
  const Harness = () => {
    const [isOpen, setIsOpen] = useState(initialOpen);
    return (
      <PromptChatPanel
        isOpen={isOpen}
        isSuppressed={isSuppressed}
        currentPrompt={currentPrompt}
        onToggle={() => setIsOpen(open => !open)}
      />
    );
  };
  return render(<Harness />);
};

describe('PromptChatPanel', () => {
  beforeEach(() => {
    sendOpenRouterChat.mockReset();
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
    });
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('opens and closes from the robot button', () => {
    renderHarness();
    const toggleButton = screen.getByRole('button', { name: 'Open prompt chat' });

    expect(toggleButton.getAttribute('aria-pressed')).toBe('false');
    expect(screen.queryByLabelText('Prompt chat message')).toBeNull();
    fireEvent.click(toggleButton);
    expect(screen.getByRole('button', { name: 'Close prompt chat' }).getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: 'Close prompt chat' }));
    expect(screen.getByRole('button', { name: 'Open prompt chat' }).getAttribute('aria-pressed')).toBe('false');
    expect(screen.queryByLabelText('Prompt chat message')).toBeNull();
  });

  it('hides the toggle and panel while a blocking overlay is active', () => {
    renderHarness('A cinematic product shot', true, true);

    expect(screen.queryByRole('button', { name: 'Open prompt chat' })).toBeNull();
    expect(screen.queryByLabelText('Prompt chat')).toBeNull();
  });

  it('keeps the open toggle position clamped to the viewport', () => {
    renderHarness();

    fireEvent.click(screen.getByRole('button', { name: 'Open prompt chat' }));

    expect(screen.getByRole('button', { name: 'Close prompt chat' }).style.left).toContain('min(');
  });

  it('centers the welcome placeholder in the chat transcript area', () => {
    renderHarness('A cinematic product shot', false, true);

    const placeholder = screen.getByText('Ask for a sharper prompt, alternate versions, or a cleaner structure.');
    const transcript = placeholder.parentElement;

    expect(transcript?.classList.contains('flex')).toBe(true);
    expect(transcript?.classList.contains('items-center')).toBe(true);
    expect(transcript?.classList.contains('justify-center')).toBe(true);
    expect(placeholder.classList.contains('max-w-[18rem]')).toBe(true);
    expect(placeholder.classList.contains('break-words')).toBe(true);
    expect(placeholder.classList.contains('whitespace-nowrap')).toBe(false);
  });

  it('reserves measured header height above transcript content', async () => {
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
      bottom: 80,
      height: 80,
      left: 0,
      right: 0,
      top: 0,
      width: 320,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    } as DOMRect); // Simulate a wrapped floating header in jsdom.
    renderHarness('A cinematic product shot', false, true);

    const placeholder = screen.getByText('Ask for a sharper prompt, alternate versions, or a cleaner structure.');
    const transcript = placeholder.parentElement as HTMLElement;

    await waitFor(() => expect(transcript.style.paddingTop).toBe('104px'));
  });

  it('sends selected model messages and renders markdown replies', async () => {
    sendOpenRouterChat.mockResolvedValue({
      message: { role: 'assistant', content: '**Better** prompt\n\n- add studio lighting' },
      model: 'anthropic/claude-sonnet-4.6',
      usage: null,
    });
    renderHarness();

    fireEvent.click(screen.getByRole('button', { name: 'Open prompt chat' }));
    fireEvent.change(screen.getByLabelText('Prompt chat model'), {
      target: { value: 'anthropic/claude-sonnet-4.6' },
    });
    fireEvent.change(screen.getByLabelText('Prompt chat message'), {
      target: { value: 'Improve this prompt' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));

    await waitFor(() => expect(sendOpenRouterChat).toHaveBeenCalledWith({
      model: 'anthropic/claude-sonnet-4.6',
      messages: [{ role: 'user', content: 'Improve this prompt' }],
    }));
    expect(screen.getByText('Improve this prompt')).toBeTruthy();
    expect(await screen.findByText('Better')).toBeTruthy();
    expect(screen.getByText('add studio lighting')).toBeTruthy();
  });

  it('lets a new chat send immediately after abandoning a pending reply', async () => {
    sendOpenRouterChat
      .mockImplementationOnce(() => new Promise(() => {})) // Keep the first reply pending until the user starts over.
      .mockResolvedValueOnce({
        message: { role: 'assistant', content: 'Fresh reply' },
        model: 'google/gemini-3.5-flash',
        usage: null,
      });
    renderHarness();

    fireEvent.click(screen.getByRole('button', { name: 'Open prompt chat' }));
    fireEvent.change(screen.getByLabelText('Prompt chat message'), {
      target: { value: 'First pending request' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    await waitFor(() => expect(sendOpenRouterChat).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByRole('button', { name: 'New chat' }));
    fireEvent.change(screen.getByLabelText('Prompt chat message'), {
      target: { value: 'Fresh request' },
    });
    expect((screen.getByRole('button', { name: 'Send' }) as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));

    await waitFor(() => expect(sendOpenRouterChat).toHaveBeenCalledTimes(2));
    expect(await screen.findByText('Fresh reply')).toBeTruthy();
  });

  it('does not render markdown images from assistant replies', async () => {
    sendOpenRouterChat.mockResolvedValue({
      message: { role: 'assistant', content: 'Useful text\n\n![hidden beacon](http://127.0.0.1/private.png)' },
      model: 'google/gemini-3.5-flash',
      usage: null,
    });
    renderHarness();

    fireEvent.click(screen.getByRole('button', { name: 'Open prompt chat' }));
    fireEvent.change(screen.getByLabelText('Prompt chat message'), {
      target: { value: 'Improve this prompt' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));

    expect(await screen.findByText('Useful text')).toBeTruthy();
    expect(screen.queryByRole('img')).toBeNull();
  });

  it('opens assistant markdown links outside the app window', async () => {
    sendOpenRouterChat.mockResolvedValue({
      message: { role: 'assistant', content: '[Reference](https://example.com/prompt-guide)' },
      model: 'google/gemini-3.5-flash',
      usage: null,
    });
    renderHarness();

    fireEvent.click(screen.getByRole('button', { name: 'Open prompt chat' }));
    fireEvent.change(screen.getByLabelText('Prompt chat message'), {
      target: { value: 'Improve this prompt' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));

    const link = await screen.findByRole('link', { name: 'Reference' });
    expect(link.getAttribute('target')).toBe('_blank');
    expect(link.getAttribute('rel')).toBe('noopener noreferrer');
  });

  it('copies the prompt bar text and latest assistant reply', async () => {
    sendOpenRouterChat.mockResolvedValue({
      message: { role: 'assistant', content: 'Improved prompt text' },
      model: 'google/gemini-3.5-flash',
      usage: null,
    });
    renderHarness('Current prompt bar text');

    fireEvent.click(screen.getByRole('button', { name: 'Open prompt chat' }));
    fireEvent.click(screen.getByRole('button', { name: 'Copy prompt' }));
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('Current prompt bar text');

    fireEvent.change(screen.getByLabelText('Prompt chat message'), {
      target: { value: 'Improve this prompt' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    await screen.findByText('Improved prompt text');
    fireEvent.click(screen.getByRole('button', { name: 'Copy latest reply' }));

    expect(navigator.clipboard.writeText).toHaveBeenLastCalledWith('Improved prompt text');
  });

  it('rejects oversized drafts before adding them to the transcript', async () => {
    renderHarness();

    fireEvent.click(screen.getByRole('button', { name: 'Open prompt chat' }));
    const textarea = screen.getByLabelText('Prompt chat message') as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: 'x'.repeat(12001) } });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));

    expect(await screen.findByText(/12,000 characters or fewer/)).toBeTruthy();
    expect(sendOpenRouterChat).not.toHaveBeenCalled();
    expect(textarea.value).toHaveLength(12001);
  });

  it('sends a capped rolling transcript within backend limits', async () => {
    let replyIndex = 0;
    sendOpenRouterChat.mockImplementation(async () => {
      const content = `Reply ${replyIndex}`;
      replyIndex += 1;
      return { message: { role: 'assistant', content }, model: 'google/gemini-3.5-flash', usage: null };
    });
    renderHarness();

    fireEvent.click(screen.getByRole('button', { name: 'Open prompt chat' }));
    for (let index = 0; index < 21; index += 1) {
      fireEvent.change(screen.getByLabelText('Prompt chat message'), {
        target: { value: `Message ${index}` },
      });
      fireEvent.click(screen.getByRole('button', { name: 'Send' }));
      expect(await screen.findByText(`Reply ${index}`)).toBeTruthy();
    }

    const lastPayload = sendOpenRouterChat.mock.calls[20]?.[0];
    expect(lastPayload.messages).toHaveLength(39);
    expect(lastPayload.messages[0]).toEqual({ role: 'user', content: 'Message 1' });
    expect(lastPayload.messages[lastPayload.messages.length - 1]).toEqual({ role: 'user', content: 'Message 20' });
    expect(lastPayload.messages.every((message, index) => message.role === (index % 2 === 0 ? 'user' : 'assistant'))).toBe(true);
  });

  it('does not submit while IME composition is active', () => {
    sendOpenRouterChat.mockResolvedValue({
      message: { role: 'assistant', content: 'Should not send' },
      model: 'google/gemini-3.5-flash',
      usage: null,
    });
    renderHarness();

    fireEvent.click(screen.getByRole('button', { name: 'Open prompt chat' }));
    const textarea = screen.getByLabelText('Prompt chat message');
    fireEvent.change(textarea, { target: { value: '入力中' } });
    const composingEnter = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
    Object.defineProperty(composingEnter, 'isComposing', { value: true }); // Simulate IME candidate confirmation.
    fireEvent(textarea, composingEnter);

    expect(sendOpenRouterChat).not.toHaveBeenCalled();
  });
});
