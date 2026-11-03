export function createBrowserSpeechAdapter({
  environment = globalThis,
  onTranscript = () => {},
  onStatus = () => {},
} = {}) {
  const Recognition =
    environment.SpeechRecognition || environment.webkitSpeechRecognition;
  const synthesis = environment.speechSynthesis;
  const Utterance = environment.SpeechSynthesisUtterance;
  let recognizer = null;

  const supportsRecognition = typeof Recognition === "function";
  const supportsSpeech =
    Boolean(synthesis) && typeof Utterance === "function";

  function startListening() {
    if (!supportsRecognition) {
      onStatus("El dictado no está disponible en este navegador.");
      return false;
    }

    try {
      recognizer = new Recognition();
      recognizer.lang = "es-MX";
      recognizer.continuous = false;
      recognizer.interimResults = false;
      recognizer.onstart = () => onStatus("Escuchando…");
      recognizer.onresult = (event) => {
        const transcript = Array.from(event.results ?? [])
          .slice(event.resultIndex ?? 0)
          .map((result) => result[0]?.transcript ?? "")
          .join(" ")
          .trim();
        if (transcript) {
          onTranscript(transcript);
        }
      };
      recognizer.onerror = (event) => {
        onStatus(
          event.error === "not-allowed"
            ? "No se concedió permiso para usar el micrófono."
            : "No se pudo completar el dictado.",
        );
      };
      recognizer.onend = () =>
        onStatus("Dictado finalizado. Revisa el texto antes de enviarlo.");
      recognizer.start();
      return true;
    } catch {
      recognizer = null;
      onStatus("No fue posible iniciar el dictado.");
      return false;
    }
  }

  function cancelListening() {
    if (recognizer) {
      recognizer.onend = null;
      recognizer.onresult = null;
      recognizer.onerror = null;
      try {
        recognizer.abort();
      } catch {
        // El reconocimiento podría haber finalizado antes de cancelarse.
      }
      recognizer = null;
      onStatus("Dictado cancelado.");
    }
  }

  function speak(text) {
    if (!supportsSpeech || !text?.trim()) {
      if (!supportsSpeech) {
        onStatus("La lectura en voz alta no está disponible en este navegador.");
      }
      return false;
    }

    try {
      synthesis.cancel();
      const utterance = new Utterance(text);
      utterance.lang = "es-MX";
      utterance.onstart = () => onStatus("Leyendo respuesta en voz alta…");
      utterance.onend = () => onStatus("Lectura finalizada.");
      utterance.onerror = () => onStatus("No se pudo leer la respuesta.");
      synthesis.speak(utterance);
      return true;
    } catch {
      onStatus("No fue posible iniciar la lectura en voz alta.");
      return false;
    }
  }

  function cancelSpeech() {
    if (supportsSpeech) {
      synthesis.cancel();
      onStatus("Lectura en voz alta cancelada.");
    }
  }

  return {
    supportsRecognition,
    supportsSpeech,
    startListening,
    cancelListening,
    speak,
    cancelSpeech,
  };
}

export function createAzureSpeechAdapter({
  speechSdk,
  endpoint,
  fetchImpl = globalThis.fetch,
  onTranscript = () => {},
  onStatus = () => {},
} = {}) {
  if (typeof speechSdk?.Recognizer?.enableTelemetry === "function") {
    speechSdk.Recognizer.enableTelemetry(false);
  }

  const supportsRecognition =
    typeof speechSdk?.SpeechRecognizer === "function" &&
    typeof speechSdk?.AudioConfig?.fromDefaultMicrophoneInput === "function" &&
    typeof speechSdk?.SpeechConfig?.fromEndpoint === "function";
  const supportsSpeech =
    typeof speechSdk?.SpeechSynthesizer === "function" &&
    typeof speechSdk?.SpeechConfig?.fromEndpoint === "function";

  let recognizer = null;
  let synthesizer = null;
  let cachedToken = null;

  async function getAccessToken() {
    if (cachedToken && cachedToken.expiresOnTimestamp > Date.now() + 60_000) {
      return cachedToken;
    }

    const response = await fetchImpl("/api/speech/token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    const result = await response.json();
    if (!response.ok || !result.token || !result.expiresOnTimestamp) {
      throw new Error("No fue posible obtener autorización para Azure Speech.");
    }
    cachedToken = result;
    return cachedToken;
  }

  function createSpeechConfig() {
    const credential = {
      getToken: getAccessToken,
    };
    const config = speechSdk.SpeechConfig.fromEndpoint(
      new URL(endpoint),
      credential,
    );
    config.speechRecognitionLanguage = "es-MX";
    config.speechSynthesisLanguage = "es-MX";
    return config;
  }

  function closeRecognizer(activeRecognizer) {
    if (recognizer !== activeRecognizer) {
      return;
    }
    recognizer = null;
    try {
      activeRecognizer.close();
    } catch {
      onStatus("No fue posible cerrar el dictado de Azure Speech.");
    }
  }

  function startListening() {
    if (!supportsRecognition) {
      onStatus("El dictado de Azure Speech no está disponible.");
      return false;
    }

    cancelListening();
    let activeAudioConfig;
    let activeRecognizer;
    try {
      activeAudioConfig = speechSdk.AudioConfig.fromDefaultMicrophoneInput();
      activeRecognizer = new speechSdk.SpeechRecognizer(
        createSpeechConfig(),
        activeAudioConfig,
      );
      recognizer = activeRecognizer;
      onStatus("Conectando con Azure Speech…");
      activeRecognizer.recognizeOnceAsync(
        (result) => {
          if (recognizer !== activeRecognizer) {
            return;
          }
          closeRecognizer(activeRecognizer);
          if (
            result.reason === speechSdk.ResultReason.RecognizedSpeech &&
            result.text?.trim()
          ) {
            onTranscript(result.text.trim());
            onStatus(
              "Dictado finalizado. Revisa el texto antes de enviarlo.",
            );
          } else {
            onStatus("Azure Speech no detectó voz. Intenta de nuevo.");
          }
        },
        () => {
          if (recognizer === activeRecognizer) {
            closeRecognizer(activeRecognizer);
            onStatus(
              "No se pudo completar el dictado con Azure Speech. Revisa el permiso del micrófono o intenta de nuevo.",
            );
          }
        },
      );
      return true;
    } catch {
      if (activeRecognizer && recognizer === activeRecognizer) {
        closeRecognizer(activeRecognizer);
      } else if (activeAudioConfig) {
        try {
          activeAudioConfig.close();
        } catch {
          onStatus("No fue posible liberar el micrófono.");
        }
      }
      onStatus("No fue posible iniciar el dictado con Azure Speech.");
      return false;
    }
  }

  function cancelListening() {
    if (recognizer) {
      closeRecognizer(recognizer);
      onStatus("Dictado cancelado.");
    }
  }

  function speak(text) {
    if (!supportsSpeech || !text?.trim()) {
      if (!supportsSpeech) {
        onStatus("La lectura de Azure Speech no está disponible.");
      }
      return false;
    }

    cancelSpeech();
    try {
      const activeSynthesizer = new speechSdk.SpeechSynthesizer(
        createSpeechConfig(),
      );
      synthesizer = activeSynthesizer;
      onStatus("Leyendo respuesta con Azure Speech…");
      activeSynthesizer.speakTextAsync(
        text,
        (result) => {
          if (synthesizer !== activeSynthesizer) {
            return;
          }
          synthesizer = null;
          try {
            activeSynthesizer.close();
          } catch {
            onStatus("No fue posible liberar la lectura de Azure Speech.");
          }
          onStatus(
            result.reason === speechSdk.ResultReason.SynthesizingAudioCompleted
              ? "Lectura finalizada."
              : "Azure Speech no pudo leer esta respuesta.",
          );
        },
        () => {
          if (synthesizer === activeSynthesizer) {
            synthesizer = null;
            try {
              activeSynthesizer.close();
            } catch {
              onStatus("No fue posible liberar la lectura de Azure Speech.");
            }
            onStatus("No se pudo leer la respuesta con Azure Speech.");
          }
        },
      );
      return true;
    } catch {
      synthesizer = null;
      onStatus("No fue posible iniciar la lectura con Azure Speech.");
      return false;
    }
  }

  function cancelSpeech() {
    if (synthesizer) {
      const activeSynthesizer = synthesizer;
      synthesizer = null;
      try {
        activeSynthesizer.close();
        onStatus("Lectura en voz alta cancelada.");
      } catch {
        onStatus("No fue posible cancelar la lectura de Azure Speech.");
      }
    }
  }

  return {
    provider: "azure",
    supportsRecognition,
    supportsSpeech,
    startListening,
    cancelListening,
    speak,
    cancelSpeech,
  };
}
