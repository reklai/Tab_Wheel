import browser from "webextension-polyfill";
import { BackgroundRuntimeMessage } from "../../common/contracts/runtimeMessages";

export interface RuntimeRetryPolicy {
  retryDelaysMs: number[];
}

export const DEFAULT_RUNTIME_RETRY_POLICY: RuntimeRetryPolicy = {
  retryDelaysMs: [0, 80, 220, 420],
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function sendRuntimeMessage<T>(
  message: BackgroundRuntimeMessage,
): Promise<T> {
  return (await browser.runtime.sendMessage(message)) as T;
}

export async function sendRuntimeMessageWithRetry<T>(
  message: BackgroundRuntimeMessage,
  policy: RuntimeRetryPolicy = DEFAULT_RUNTIME_RETRY_POLICY,
): Promise<T> {
  let lastError: unknown = null;
  for (const delay of policy.retryDelaysMs) {
    if (delay > 0) {
      await sleep(delay);
    }

    try {
      return await sendRuntimeMessage<T>(message);
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError || new Error(`Runtime message failed: ${message.type}`);
}
