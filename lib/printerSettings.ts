import AsyncStorage from '@react-native-async-storage/async-storage';

export type PaperSize = '58mm' | '80mm';

export async function getPrinterPaperSize(): Promise<PaperSize> {
  try {
    const saved = await AsyncStorage.getItem('printerPaperSize');
    if (saved === '58mm' || saved === '80mm') {
      return saved;
    }
  } catch {
    // fall through to default
  }
  return '80mm';
}

export function paperSizeToPxWidth(size: PaperSize): number {
  return size === '58mm' ? 210 : 300;
}

export function thermalPrintStyles(paperSize: PaperSize): string {
  const pxWidth = paperSizeToPxWidth(paperSize);
  return `
    @page { margin: 0; size: ${paperSize} auto; }
    body {
      font-family: monospace;
      margin: 0;
      padding: 10px;
      width: ${pxWidth}px;
      color: #000;
      font-size: 14px;
      line-height: 1.2;
    }
  `;
}

export function formatSaleBillNumber(saleId: string): string {
  return saleId.replace(/-/g, '').slice(0, 8).toUpperCase();
}
