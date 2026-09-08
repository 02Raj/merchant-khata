import * as FileSystem from 'expo-file-system/legacy';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';

function toFileUri(uri: string): string {
  if (uri.startsWith('file://') || uri.startsWith('content://')) {
    return uri;
  }
  if (uri.startsWith('/')) {
    return `file://${uri}`;
  }
  return uri;
}

function pdfCacheUri(filename: string): string {
  const base = (FileSystem.cacheDirectory ?? '').replace(/\/?$/, '/');
  const safe = filename.replace(/[^\w.-]+/g, '_');
  const withExt = safe.toLowerCase().endsWith('.pdf') ? safe : `${safe}.pdf`;
  return `${base}${withExt}`;
}

/** Print HTML to a cache PDF Sharing is allowed to read, then open the share sheet. */
export async function shareHtmlAsPdf(
  html: string,
  filename: string,
  options?: { width?: number; height?: number; dialogTitle?: string },
): Promise<void> {
  const { uri } = await Print.printToFileAsync({
    html,
    width: options?.width ?? 595,
    height: options?.height ?? 842,
  });

  const source = toFileUri(uri);
  const dest = pdfCacheUri(filename);
  await FileSystem.deleteAsync(dest, { idempotent: true });
  await FileSystem.copyAsync({ from: source, to: dest });

  if (!(await Sharing.isAvailableAsync())) {
    throw new Error('Sharing is not available on this device');
  }

  await Sharing.shareAsync(dest, {
    mimeType: 'application/pdf',
    UTI: 'com.adobe.pdf',
    dialogTitle: options?.dialogTitle ?? 'Share PDF',
  });
}
