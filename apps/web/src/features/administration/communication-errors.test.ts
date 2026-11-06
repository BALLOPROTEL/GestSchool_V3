import { describe, expect, it } from 'vitest';
import { PeopleError } from '../directory/people-client';
import { brevoHttpStatus, communicationErrorKey, deliveryErrorKey } from './communication-errors';

describe('communication error presentation', () => {
  it('distinguishes permissions, session and availability failures', () => {
    expect(communicationErrorKey(new PeopleError('AUTH_FORBIDDEN'))).toBe('forbidden');
    expect(communicationErrorKey(new PeopleError('AUTH_SESSION_EXPIRED'))).toBe('sessionExpired');
    expect(communicationErrorKey(new PeopleError('AUTH_UNAVAILABLE'))).toBe('unavailable');
  });

  it('explains audience failures without exposing provider payloads', () => {
    expect(
      communicationErrorKey(new PeopleError('COMMUNICATION_AUDIENCE_FORBIDDEN'), 'action'),
    ).toBe('audienceForbidden');
    expect(communicationErrorKey(new PeopleError('COMMUNICATION_AUDIENCE_EMPTY'), 'action')).toBe(
      'audienceEmpty',
    );
    expect(
      communicationErrorKey(new PeopleError('COMMUNICATION_AUDIENCE_TOO_LARGE'), 'action'),
    ).toBe('audienceTooLarge');
    expect(communicationErrorKey(new PeopleError('COMMUNICATION_AUDIENCE_CHANGED'), 'action')).toBe(
      'audienceChanged',
    );
  });

  it('keeps delivery diagnostics bounded to safe categories', () => {
    expect(brevoHttpStatus('BREVO_HTTP_403')).toBe('403');
    expect(brevoHttpStatus('provider body with secret')).toBeNull();
    expect(deliveryErrorKey('BREVO_CONNECTION_UNCERTAIN')).toBe('providerUnavailable');
    expect(deliveryErrorKey('STAGING_RECIPIENT_NOT_AUTHORIZED')).toBe('recipientNotAuthorized');
    expect(deliveryErrorKey('WHATSAPP_NOT_AUTHORIZED')).toBe('channelNotAuthorized');
    expect(deliveryErrorKey('anything-sensitive')).toBe('deliveryFailed');
  });
});
