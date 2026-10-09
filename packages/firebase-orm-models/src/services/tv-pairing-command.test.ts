import 'reflect-metadata';
import { beforeAll, describe, expect, it } from 'vitest';
import { FirestoreOrmRepository } from '@arbel/firebase-orm';
import {
  TvPairingModel,
  type TvPairingPowerState,
  type TvPairingCommandType,
  type TvPairingPendingCommand,
  type TvPairingCommandResult,
  type TvPairingCecSchedule,
} from '../index';

beforeAll(() => {
  const repo = FirestoreOrmRepository as unknown as {
    globalFirestores: Record<string, unknown>;
    DEFAULT_KEY_NAME: string;
  };
  repo.globalFirestores[repo.DEFAULT_KEY_NAME] = {};
});

describe('TvPairingModel power management and commands (KAN-307)', () => {
  it('instantiates TvPairingModel with power management and remote command fields', () => {
    const pairing = new TvPairingModel();
    pairing.device_token_hash = 'hash-device-123';
    pairing.code_hash = 'hash-code-123';
    pairing.code_expires_at = '2026-10-10T00:00:00.000Z';
    pairing.claimed = true;
    pairing.created_at = '2026-10-09T00:00:00.000Z';
    pairing.power_state = 'on';

    const pendingCmd: TvPairingPendingCommand = {
      commandId: 'cmd-1',
      type: 'display_sleep',
      issuedAt: '2026-10-09T18:00:00.000Z',
      issuedBy: 'user-admin',
      parameters: { delaySeconds: 5 },
    };
    pairing.pending_command = pendingCmd;

    const cmdResult: TvPairingCommandResult = {
      commandId: 'cmd-0',
      type: 'reboot',
      executedAt: '2026-10-09T17:55:00.000Z',
      status: 'acknowledged',
    };
    pairing.last_command_result = cmdResult;

    const cecSchedule: TvPairingCecSchedule = {
      enabled: true,
      sleepTime: '20:00',
      wakeTime: '08:00',
      timezone: 'Asia/Jerusalem',
    };
    pairing.cec_standby_schedule = cecSchedule;

    expect(pairing.power_state).toBe('on');
    expect(pairing.pending_command?.commandId).toBe('cmd-1');
    expect(pairing.pending_command?.type).toBe('display_sleep');
    expect(pairing.last_command_result?.status).toBe('acknowledged');
    expect(pairing.cec_standby_schedule?.sleepTime).toBe('20:00');

    const data = pairing.getData();
    expect(data.power_state).toBe('on');
    expect(data.pending_command).toEqual(pendingCmd);
    expect(data.last_command_result).toEqual(cmdResult);
    expect(data.cec_standby_schedule).toEqual(cecSchedule);
  });

  it('exposes the reference path for TvPairingModel as top-level tv_pairings', () => {
    const pairing = new TvPairingModel();
    expect(pairing.getReferencePath()).toBe('tv_pairings');
  });
});
