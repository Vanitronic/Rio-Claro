import {
  createAzureSpeechAdapter,
  createBrowserSpeechAdapter,
} from "/speechAdapter.js";

const chatForm = document.querySelector("#chat-form");
const messageInput = document.querySelector("#message-input");
const sendButton = document.querySelector("#send-button");
const messages = document.querySelector("#messages");
const typingStatus = document.querySelector("#typing-status");
const claimForm = document.querySelector("#claim-form");
const claimSubmit = document.querySelector("#claim-submit");
const claimStatus = document.querySelector("#claim-status");
const voiceConsent = document.querySelector("#voice-opt-in");
const voiceInputButton = document.querySelector("#voice-input-button");
const voiceReadButton = document.querySelector("#voice-read-button");
const voiceCancelButton = document.querySelector("#voice-cancel-button");
const voiceStatus = document.querySelector("#voice-status");

let conversationId = null;
let speechReady = false;
const employeeSessionStorageKey = "rio-claro-employee-session";
let lastAssistantReply =
  document.querySelector("#messages .message-assistant p")?.textContent || "";

function addEmployeeSessionHeader(headers) {
  const sessionId = sessionStorage.getItem(employeeSessionStorageKey);
  if (sessionId) {
    headers["X-Employee-Session"] = sessionId;
  }
  return headers;
}

function saveEmployeeSession(response) {
  const sessionId = response.headers.get("X-Employee-Session");
  if (sessionId) {
    sessionStorage.setItem(employeeSessionStorageKey, sessionId);
  }
}

const speechCallbacks = {
  onTranscript: (transcript) => {
    const currentText = messageInput.value.trim();
    messageInput.value = currentText
      ? `${currentText} ${transcript}`
      : transcript;
    messageInput.focus();
    updateVoiceControls();
    voiceStatus.textContent =
      "Dictado agregado. Revisa o edita el texto antes de enviarlo.";
  },
  onStatus: (status) => {
    voiceStatus.textContent = status;
    if (
      status.startsWith("Dictado finalizado") ||
      status === "Dictado cancelado." ||
      status.startsWith("Azure Speech no detectó voz") ||
      status.startsWith("No se pudo completar el dictado") ||
      status.startsWith("No fue posible iniciar el dictado")
    ) {
      voiceInputButton.setAttribute("aria-pressed", "false");
    }
  },
};
const browserSpeechAdapter = createBrowserSpeechAdapter(speechCallbacks);
let speechAdapter = browserSpeechAdapter;

function updateVoiceControls() {
  const enabled = speechReady && voiceConsent.checked;
  voiceInputButton.disabled = !enabled || !speechAdapter.supportsRecognition;
  voiceReadButton.disabled =
    !enabled || !speechAdapter.supportsSpeech || !lastAssistantReply;
  voiceCancelButton.disabled =
    !enabled ||
    (!speechAdapter.supportsRecognition && !speechAdapter.supportsSpeech);
}

function loadSpeechSdk() {
  if (globalThis.SpeechSDK) {
    return Promise.resolve(globalThis.SpeechSDK);
  }

  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "/vendor/speech-sdk.js";
    script.async = true;
    script.onload = () => resolve(globalThis.SpeechSDK);
    script.onerror = () => reject(new Error("No fue posible cargar el SDK."));
    document.head.append(script);
  });
}

async function initializeSpeech() {
  try {
    const response = await fetch("/api/speech/config", { cache: "no-store" });
    if (!response.ok) {
      throw new Error("No fue posible consultar Azure Speech.");
    }
    const config = await response.json();

    const speechSdk = config.enabled ? await loadSpeechSdk() : null;
    if (config.enabled && speechSdk) {
      const azureAdapter = createAzureSpeechAdapter({
        speechSdk,
        endpoint: config.endpoint,
        ...speechCallbacks,
      });
      if (azureAdapter.supportsRecognition || azureAdapter.supportsSpeech) {
        speechAdapter = azureAdapter;
        voiceStatus.textContent =
          "Azure Speech está disponible. Activa la casilla para comenzar.";
      } else {
        voiceStatus.textContent =
          "El SDK de Azure Speech no está disponible. Se usará la voz del navegador.";
      }
    } else {
      voiceStatus.textContent =
        config.enabled
          ? "No se pudo cargar el SDK de Azure Speech. Se usará la voz del navegador."
          : "Azure Speech no está habilitado. Se usará la voz disponible en el navegador.";
    }
  } catch {
    voiceStatus.textContent =
      "No se pudo conectar con Azure Speech. Se usará la voz disponible en el navegador.";
  } finally {
    speechReady = true;
    voiceConsent.disabled = false;
    updateVoiceControls();
  }
}

function addMessage(text, ...classNames) {
  const article = document.createElement("article");
  const paragraph = document.createElement("p");

  article.classList.add("message", ...classNames);
  paragraph.textContent = text;
  article.append(paragraph);
  messages.append(article);
  messages.scrollTop = messages.scrollHeight;
}

chatForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const message = messageInput.value.trim();
  if (!message || message.length > 2000) {
    messageInput.focus();
    return;
  }

  addMessage(message, "message-user");
  messageInput.value = "";
  sendButton.disabled = true;
  typingStatus.textContent = "Escribiendo…";

  try {
    const result = await fetch("/api/chat", {
      method: "POST",
      headers: addEmployeeSessionHeader({
        "Content-Type": "application/json",
      }),
      body: JSON.stringify({
        message,
        conversation_id: conversationId,
      }),
    });
    saveEmployeeSession(result);
    const data = await result.json();

    if (!result.ok) {
      throw new Error(data.error || "No fue posible enviar el mensaje.");
    }

    conversationId = data.conversation_id;
    addMessage(data.reply, "message-assistant");
    lastAssistantReply = data.reply;
    updateVoiceControls();
  } catch (error) {
    const errorMessage =
      error instanceof Error
        ? error.message
        : "No fue posible conectar con el asistente. Intenta de nuevo.";
    addMessage(errorMessage, "message-assistant", "message-error");
  } finally {
    sendButton.disabled = false;
    typingStatus.textContent = "";
    messageInput.focus();
  }
});

voiceConsent.addEventListener("change", () => {
  updateVoiceControls();
  if (!voiceConsent.checked) {
    speechAdapter.cancelListening();
    speechAdapter.cancelSpeech();
    voiceInputButton.setAttribute("aria-pressed", "false");
    voiceStatus.textContent =
      "Funciones de voz desactivadas. El chat de texto sigue disponible.";
    return;
  }

  if (!speechAdapter.supportsRecognition && !speechAdapter.supportsSpeech) {
    voiceStatus.textContent =
      "Las funciones de voz no están disponibles en este navegador. El chat de texto sigue disponible.";
  } else {
    voiceStatus.textContent =
      speechAdapter.provider === "azure"
        ? "Azure Speech está activado. El micrófono se solicitará al iniciar un dictado."
        : "Funciones de voz del navegador activadas. El micrófono se solicitará al iniciar un dictado.";
  }
});

voiceInputButton.addEventListener("click", () => {
  if (!voiceConsent.checked) {
    return;
  }
  if (speechAdapter.startListening()) {
    voiceInputButton.setAttribute("aria-pressed", "true");
  }
});

voiceReadButton.addEventListener("click", () => {
  if (voiceConsent.checked) {
    speechAdapter.speak(lastAssistantReply);
  }
});

voiceCancelButton.addEventListener("click", () => {
  if (!voiceConsent.checked) {
    return;
  }
  speechAdapter.cancelListening();
  speechAdapter.cancelSpeech();
  voiceInputButton.setAttribute("aria-pressed", "false");
});

updateVoiceControls();
initializeSpeech();

claimForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  claimSubmit.disabled = true;
  claimStatus.textContent = "Enviando…";
  const formData = new FormData(claimForm);

  try {
    const response = await fetch("/api/claims", {
      method: "POST",
      headers: addEmployeeSessionHeader({
        "Content-Type": "application/json",
      }),
      body: JSON.stringify(Object.fromEntries(formData)),
    });
    saveEmployeeSession(response);
    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.error || "No fue posible registrar el reclamo.");
    }

    claimStatus.textContent = `Reclamo ${result.folio} registrado como ${result.estado}.`;
    claimForm.reset();
  } catch (error) {
    claimStatus.textContent =
      error instanceof Error ? error.message : "Ocurrió un error.";
  } finally {
    claimSubmit.disabled = false;
  }
});
