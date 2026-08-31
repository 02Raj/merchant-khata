import { Alert, Linking } from 'react-native';

import { buildUdhaarReminderMessage, formatPhoneForWhatsApp } from '@/lib/customerKhata';

export async function openWhatsAppUdhaarReminder(params: {
  phone: string;
  customerName: string;
  balance: number;
  businessName: string;
}): Promise<boolean> {
  const phoneStr = formatPhoneForWhatsApp(params.phone);
  if (!phoneStr) {
    Alert.alert('Invalid phone', 'Add a valid 10-digit mobile number for this customer.');
    return false;
  }

  const message = buildUdhaarReminderMessage({
    customerName: params.customerName,
    balance: params.balance,
    businessName: params.businessName,
  });

  const url = `whatsapp://send?phone=${phoneStr}&text=${encodeURIComponent(message)}`;

  try {
    const canOpen = await Linking.canOpenURL(url);
    if (!canOpen) {
      Alert.alert('WhatsApp not found', 'Install WhatsApp to send payment reminders.');
      return false;
    }
    await Linking.openURL(url);
    return true;
  } catch {
    Alert.alert('Error', 'Could not open WhatsApp.');
    return false;
  }
}
