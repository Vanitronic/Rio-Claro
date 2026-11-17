import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createAzureSpeechAdapter,
  createBrowserSpeechAdapter,
} from "../public/speechAdapter.js";

test("las funciones de voz faltantes no bloquean el uso de texto ni lanzan errores", () => {
  const statuses = [];
  const speech = createBrowserSpeechAdapter({
    environment: {},
    onStatus: (status) => statuses.push(status),
  });

  assert.equal(speech.supportsRecognition, false);
  assert.equal(speech.supportsSpeech, false);
  assert.equal(speech.startListening(), false);
  assert.equal(speech.speak("Respuesta de prueba."), false);
  assert.doesNotThrow(() => speech.cancelListening());
  assert.doesNotThrow(() => speech.cancelSpeech());
  assert.match(statuses.join(" "), /no está disponible/);
});

test("el adaptador Azure usa credenciales temporales para dictado y síntesis", async () => {
  const transcripts = [];
  const statuses = [];
  const requestedTokens = [];
  const telemetrySettings = [];
  let recognizerInstance;
  let synthesizerInstance;

  class SpeechRecognizer {
    constructor(config, audioConfig) {
      this.config = config;
      this.audioConfig = audioConfig;
      recognizerInstance = this;
    }

    recognizeOnceAsync(success, error) {
      this.config.credential.getToken().then(
        () => success({ reason: 1, text: "Consulta de prueba" }),
        error,
      );
    }

    close() {}
  }

  class SpeechSynthesizer {
    constructor(config) {
      this.config = config;
      synthesizerInstance = this;
    }

    speakTextAsync(_text, success, error) {
      this.config.credential.getToken().then(
        () => success({ reason: 2 }),
        error,
      );
    }

    close() {}
  }

  const speechSdk = {
    Recognizer: {
      enableTelemetry(enabled) {
        telemetrySettings.push(enabled);
      },
    },
    SpeechConfig: {
      fromEndpoint(endpoint, credential) {
        assert.equal(
          endpoint.href,
          "https://rio-claro.cognitiveservices.azure.com/",
        );
        return { credential };
      },
    },
    AudioConfig: {
      fromDefaultMicrophoneInput: () => ({ close() {} }),
    },
    SpeechRecognizer,
    SpeechSynthesizer,
    ResultReason: {
      RecognizedSpeech: 1,
      SynthesizingAudioCompleted: 2,
    },
  };
  const adapter = createAzureSpeechAdapter({
    speechSdk,
    endpoint: "https://rio-claro.cognitiveservices.azure.com/",
    fetchImpl: async (url, options) => {
      requestedTokens.push({ url, options });
      return {
        ok: true,
        async json() {
          return {
            token: "short-lived-token",
            expiresOnTimestamp: Date.now() + 3_600_000,
          };
        },
      };
    },
    onTranscript: (text) => transcripts.push(text),
    onStatus: (status) => statuses.push(status),
  });

  assert.equal(adapter.provider, "azure");
  assert.equal(adapter.supportsRecognition, true);
  assert.equal(adapter.supportsSpeech, true);
  assert.deepEqual(telemetrySettings, [false]);
  assert.equal(adapter.startListening(), true);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(recognizerInstance.config.speechRecognitionLanguage, "es-MX");
  assert.deepEqual(transcripts, ["Consulta de prueba"]);
  assert.equal(adapter.speak("Respuesta de prueba."), true);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(synthesizerInstance.config.speechSynthesisLanguage, "es-MX");
  assert.equal(requestedTokens.length, 1);
  assert.equal(requestedTokens[0].url, "/api/speech/token");
  assert.match(statuses.join(" "), /Lectura finalizada/);
});
