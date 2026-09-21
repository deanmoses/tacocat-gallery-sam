export type WaitOptions = {
    /** What is being waited for, for the timeout error */
    description: string;
    timeoutMs?: number;
    intervalMs?: number;
};

/**
 * Poll until the condition returns a truthy value and return it.
 *
 * S3 event notifications, Lambda invocations and DynamoDB Streams have no
 * completion signal a test can await, and their latency is usually seconds
 * but occasionally much longer, so tests observe the effect instead.
 */
export async function waitFor<T>(
    condition: () => Promise<T>,
    { description, timeoutMs = 20000, intervalMs = 500 }: WaitOptions,
): Promise<NonNullable<T>> {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
        const result = await condition();
        if (result) return result;
        if (Date.now() >= deadline) throw new Error(`Timed out after ${timeoutMs}ms waiting for ${description}`);
        await new Promise((r) => setTimeout(r, intervalMs));
    }
}
