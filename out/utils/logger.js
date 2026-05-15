"use strict";
// =============================================================================
// Mastors CDN Core IntelliSense
// utils/logger.ts — Structured output channel logger
// =============================================================================
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.Logger = void 0;
const vscode = __importStar(require("vscode"));
let _channel;
function channel() {
    if (!_channel) {
        _channel = vscode.window.createOutputChannel('Mastors IntelliSense');
    }
    return _channel;
}
function timestamp() {
    return new Date().toISOString().slice(11, 23); // HH:MM:SS.mmm
}
exports.Logger = {
    info(msg) {
        channel().appendLine(`[${timestamp()}] INFO  ${msg}`);
    },
    warn(msg) {
        channel().appendLine(`[${timestamp()}] WARN  ${msg}`);
    },
    error(msg, err) {
        channel().appendLine(`[${timestamp()}] ERROR ${msg}`);
        if (err instanceof Error) {
            channel().appendLine(`           ${err.stack ?? err.message}`);
        }
    },
    debug(msg) {
        const cfg = vscode.workspace.getConfiguration('mastorsIntellisense');
        if (cfg.get('debugLogging', false)) {
            channel().appendLine(`[${timestamp()}] DEBUG ${msg}`);
        }
    },
    dispose() {
        _channel?.dispose();
        _channel = undefined;
    },
};
//# sourceMappingURL=logger.js.map