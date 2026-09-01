import * as Print from 'expo-print';

function isPrintCancelled(error: unknown): boolean {
  const message = String((error as Error)?.message ?? error ?? '').toLowerCase();
  return (
    message.includes('cancel')
    || message.includes('cancelled')
    || message.includes('canceled')
    || message.includes('did not complete')
    || message.includes('printing failed')
    || message.includes('user denied')
  );
}

/** Prints HTML; returns 'cancelled' when user dismisses the system print dialog (not an error). */
export async function safePrintAsync(
  options: Print.PrintOptions,
): Promise<'printed' | 'cancelled'> {
  try {
    await Print.printAsync(options);
    return 'printed';
  } catch (error) {
    if (isPrintCancelled(error)) {
      return 'cancelled';
    }
    throw error;
  }
}
