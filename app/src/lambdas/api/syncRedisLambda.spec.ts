import { Context, Callback } from 'aws-lambda';
import { handler, SyncRedisEvent } from './syncRedisLambda';

const mockContext = {} as Context;
const mockCallback = (() => {}) as Callback;

describe('syncRedisLambda', () => {
    describe('direct invoke mode validation', () => {
        test('throws error for missing mode', async () => {
            const event = {} as unknown as SyncRedisEvent;
            await expect(handler(event, mockContext, mockCallback)).rejects.toThrow(
                'Invalid mode: "undefined". Must be one of: diagnose, fix, init',
            );
        });

        test('throws error for invalid mode', async () => {
            const event = { mode: 'diagnosee' } as unknown as SyncRedisEvent;
            await expect(handler(event, mockContext, mockCallback)).rejects.toThrow(
                'Invalid mode: "diagnosee". Must be one of: diagnose, fix, init',
            );
        });

        test('throws error for typo in mode field name', async () => {
            const event = { mod: 'fix' } as unknown as SyncRedisEvent;
            await expect(handler(event, mockContext, mockCallback)).rejects.toThrow(
                'Invalid mode: "undefined". Must be one of: diagnose, fix, init',
            );
        });
    });
});
