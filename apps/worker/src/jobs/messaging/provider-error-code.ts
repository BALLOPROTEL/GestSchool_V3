const safeProviderError =
  /^(BREVO_HTTP_\d{3}|BREVO_CONNECTION_UNCERTAIN|BREVO_RESPONSE_UNCERTAIN|STAGING_RECIPIENT_NOT_AUTHORIZED|STAGING_CHANNEL_NOT_AUTHORIZED|WHATSAPP_NOT_AUTHORIZED|BREVO_WHATSAPP_SENDER_MISSING|BREVO_WHATSAPP_TEMPLATE_MISSING)$/;

export function safeMessagingFailureCode(error: unknown): string {
  const message = error instanceof Error ? error.message : '';
  return safeProviderError.test(message) ? message : 'MESSAGING_DELIVERY_FAILED';
}
