import { Component, createRef } from 'react';
import { ActivityIndicator, Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import WebView from 'react-native-webview/lib/WebView';
import type { WebViewMessageEvent } from 'react-native-webview';
import type { ApplicationVerifier } from 'firebase/auth';

import type { FirebaseWebConfig } from '@/lib/firebaseConfig';
import { Colors } from '@/lib/theme';
type Props = {
  firebaseConfig: FirebaseWebConfig;
};

type State = {
  visible: boolean;
  loaded: boolean;
};

export default class FirebaseRecaptchaVerifierModal extends Component<Props, State> implements ApplicationVerifier {
  state: State = {
    visible: false,
    loaded: false,
  };

  private resolve?: (token: string) => void;
  private reject?: (error: Error) => void;
  private webview = createRef<WebView>();

  get type() {
    return 'recaptcha';
  }

  verify(): Promise<string> {
    return new Promise((resolve, reject) => {
      this.resolve = resolve;
      this.reject = reject;
      this.setState({ visible: true, loaded: false });
    });
  }

  _reset() {}

  private cancel = () => {
    this.reject?.(new Error('reCAPTCHA cancelled'));
    this.resolve = undefined;
    this.reject = undefined;
    this.setState({ visible: false, loaded: false });
  };

  private onMessage = (event: WebViewMessageEvent) => {
    try {
      const data = JSON.parse(event.nativeEvent.data) as { type: string; token?: string };
      if (data.type === 'load') {
        this.setState({ loaded: true });
        return;
      }
      if (data.type === 'error') {
        this.reject?.(new Error('Failed to load reCAPTCHA'));
        this.resolve = undefined;
        this.reject = undefined;
        this.setState({ visible: false, loaded: false });
        return;
      }
      if (data.type === 'verify' && data.token) {
        this.resolve?.(data.token);
        this.resolve = undefined;
        this.reject = undefined;
        this.setState({ visible: false, loaded: false });
      }
    } catch {
      this.reject?.(new Error('Invalid reCAPTCHA response'));
      this.setState({ visible: false, loaded: false });
    }
  };

  render() {
    const { firebaseConfig } = this.props;
    const { visible, loaded } = this.state;
    const html = recaptchaHtml(firebaseConfig);

    return (
      <Modal visible={visible} animationType="fade" transparent onRequestClose={this.cancel}>
        <View style={styles.overlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Security Check</Text>
              <Text style={styles.modalSubtitle}>Confirm you are not a robot</Text>
            </View>
            
            <View style={styles.webviewContainer}>
              {!loaded ? (
                <View style={styles.loadingContainer}>
                  <ActivityIndicator color={Colors.accent} size="large" />
                  <Text style={styles.loadingText}>Loading reCAPTCHA…</Text>
                </View>
              ) : null}
              <WebView
                ref={this.webview}
                javaScriptEnabled
                originWhitelist={['*']}
                source={{ html, baseUrl: `https://${firebaseConfig.authDomain}` }}
                onMessage={this.onMessage}
                style={[styles.webview, !loaded && { opacity: 0 }]}
                scrollEnabled={false}
                bounces={false}
              />
            </View>

            <View style={styles.modalFooter}>
              <TouchableOpacity style={styles.cancelButton} onPress={this.cancel}>
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    );
  }
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalContent: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: Colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: 'hidden',
  },
  modalHeader: {
    padding: 24,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: Colors.textPrimary,
    marginBottom: 4,
  },
  modalSubtitle: {
    fontSize: 13,
    color: Colors.textSecondary,
  },
  webviewContainer: {
    height: 520,
    width: '100%',
    backgroundColor: 'transparent', // reCAPTCHA now has transparent background
    position: 'relative',
  },
  loadingContainer: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    zIndex: 1,
  },
  loadingText: {
    marginTop: 12,
    color: Colors.textSecondary,
    fontSize: 14,
  },
  webview: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  modalFooter: {
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    backgroundColor: Colors.surfaceRaised,
  },
  cancelButton: {
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  cancelButtonText: {
    color: Colors.textPrimary,
    fontSize: 14,
    fontWeight: '500',
  },
});

function recaptchaHtml(config: FirebaseWebConfig): string {
  return `<!DOCTYPE html>
<html>
  <head>
    <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
    <script src="https://www.gstatic.com/firebasejs/8.10.1/firebase-app.js"></script>
    <script src="https://www.gstatic.com/firebasejs/8.10.1/firebase-auth.js"></script>
    <style>
      body {
        margin: 0;
        padding-top: 24px;
        background-color: transparent;
        display: flex;
        justify-content: center;
      }
    </style>
    <script>
      firebase.initializeApp(${JSON.stringify(config)});
      function onVerify(token) {
        window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'verify', token: token }));
      }
      function onLoad() {
        window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'load' }));
        window.recaptchaVerifier = new firebase.auth.RecaptchaVerifier('recaptcha-cont', {
          size: 'normal',
          callback: onVerify
        });
        window.recaptchaVerifier.render();
      }
      function onError() {
        window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'error' }));
      }
    </script>
  </head>
  <body onload="onLoad()">
    <div id="recaptcha-cont"></div>
  </body>
</html>`;
}
