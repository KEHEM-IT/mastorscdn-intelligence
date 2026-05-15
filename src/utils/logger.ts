// =============================================================================
// Mastors CDN Core IntelliSense
// utils/logger.ts — Structured output channel logger
// =============================================================================

import * as vscode from 'vscode';

let _channel: vscode.OutputChannel | undefined;

function channel(): vscode.OutputChannel {
  if (!_channel) {
    _channel = vscode.window.createOutputChannel('Mastors IntelliSense');
  }
  return _channel;
}

function timestamp(): string {
  return new Date().toISOString().slice(11, 23); // HH:MM:SS.mmm
}

export const Logger = {
  info(msg: string): void {
    channel().appendLine(`[${timestamp()}] INFO  ${msg}`);
  },
  warn(msg: string): void {
    channel().appendLine(`[${timestamp()}] WARN  ${msg}`);
  },
  error(msg: string, err?: unknown): void {
    channel().appendLine(`[${timestamp()}] ERROR ${msg}`);
    if (err instanceof Error) {
      channel().appendLine(`           ${err.stack ?? err.message}`);
    }
  },
  debug(msg: string): void {
    const cfg = vscode.workspace.getConfiguration('mastorsIntellisense');
    if (cfg.get<boolean>('debugLogging', false)) {
      channel().appendLine(`[${timestamp()}] DEBUG ${msg}`);
    }
  },
  dispose(): void {
    _channel?.dispose();
    _channel = undefined;
  },
};
